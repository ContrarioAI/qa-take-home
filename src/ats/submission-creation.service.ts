import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../integrations/analytics.service';
import { S3Service } from '../integrations/s3.service';
import { CascadeService } from './cascade.service';
import { SubmitCandidateDto, ScreeningAnswerDto } from './dto/submit-candidate.dto';

const MAX_ANSWER_LENGTH = 5000;

export const MESSAGES = {
  NOT_RECRUITER: 'Only recruiters can submit candidates.',
  ANSWER_TOO_LONG: 'A screening answer exceeds the maximum allowed length.',
  RESUME_REQUIRED: 'A resume must be uploaded before submitting.',
  JOB_NOT_FOUND: 'Job not found.',
  EXCLUSIVE: 'This role is currently in an exclusive access period.',
  NO_ACCESS_AGENCY: 'Your agency does not have access to this role.',
  NO_ACCESS_SELF: 'You do not have access to this role.',
  BYPASS_EXHAUSTED: 'Role approval bypass quota exhausted.',
  COLLISION: 'This candidate has already been submitted to this role.',
};

@Injectable()
export class SubmissionCreationService {
  private readonly logger = new Logger(SubmissionCreationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly s3: S3Service,
    private readonly cascade: CascadeService,
  ) {}

  async createSubmission(userId: string | undefined, dto: SubmitCandidateDto) {
    // Any thrown error fires api_candidate_submission_failed (even the non-recruiter gate).
    try {
      return await this.run(userId, dto);
    } catch (err: any) {
      this.analytics.track('api_candidate_submission_failed', userId ?? 'anonymous', {
        reason: err?.message ?? 'unknown',
        jobId: dto?.jobId,
      });
      throw err;
    }
  }

  private async run(userId: string | undefined, dto: SubmitCandidateDto) {
    // --- Step 1: auth & recruiter gate ---
    const user = userId
      ? await this.prisma.user.findUnique({ where: { id: userId } })
      : null;
    if (!user || !user.isRecruiter) {
      throw new ForbiddenException(MESSAGES.NOT_RECRUITER);
    }

    // --- Step 2: validate & resolve the candidate ---
    const filteredAnswers = this.filterAndValidateAnswers(dto.screeningAnswers ?? []);

    const rc = await this.findOrCreateRecruiterCandidate(user.id, dto);

    const hasRequestResume = !!dto.candidate.resumeTempKey;
    const resumeOnFile = rc.resumeUrl ?? dto.candidate.resumeUrl ?? null;
    if (!hasRequestResume && !resumeOnFile) {
      throw new BadRequestException(MESSAGES.RESUME_REQUIRED);
    }

    // --- Step 3: identity + agency context (identity pulled from the RC row) ---
    const identity = {
      name: rc.name,
      email: rc.email.toLowerCase(),
      linkedin: rc.linkedin,
      resumeUrl: resumeOnFile,
    };
    const agencyId = user.agencyId ?? null;

    // --- Step 4: authorization gates, in strict order ---
    // 4a. Job lookup first so 404 always precedes 403.
    const job = await this.prisma.job.findUnique({ where: { id: dto.jobId } });
    if (!job || !job.active || job.deletedAt) {
      throw new NotFoundException(MESSAGES.JOB_NOT_FOUND);
    }

    const directAccess = await this.prisma.recruiterRoleAccess.findUnique({
      where: { recruiterId_jobId: { recruiterId: user.id, jobId: job.id } },
    });
    const hasDirectAccess = !!directAccess;

    // 4b. Role-exclusivity guard (THIS is the PR #232 guard) — runs unconditionally.
    if (!hasDirectAccess && this.isJobExclusivityActive(job)) {
      throw new ForbiddenException(MESSAGES.EXCLUSIVE);
    }

    // 4c. Standard access + bypass quota.
    let usedBypass = false;
    if (!hasDirectAccess) {
      if (user.useRoleApprovalBypass) {
        if (user.bypassQuota <= 0) {
          throw new ForbiddenException(MESSAGES.BYPASS_EXHAUSTED);
        }
        usedBypass = true;
      } else {
        throw new ForbiddenException(
          user.agencyId ? MESSAGES.NO_ACCESS_AGENCY : MESSAGES.NO_ACCESS_SELF,
        );
      }
    }

    // --- Step 5: collision check (DB only) ---
    const collision = await this.prisma.candidateSubmission.findFirst({
      where: {
        jobId: job.id,
        candidateProfile: { email: identity.email },
      },
    });
    if (collision) {
      this.analytics.track('api_candidate_submission_collision', user.id, {
        jobId: job.id,
        email: identity.email,
      });
      throw new ConflictException(MESSAGES.COLLISION);
    }

    // --- Step 6: persist (transaction rolls back the profile if the submission fails) ---
    const profileId = uuidv4();
    const submissionId = uuidv4();
    const submission = await this.prisma.$transaction(async (tx) => {
      await tx.candidateProfile.create({
        data: {
          id: profileId,
          name: identity.name,
          email: identity.email, // already lowercased
          linkedin: identity.linkedin,
          resumeUpload: identity.resumeUrl,
        },
      });
      return tx.candidateSubmission.create({
        data: {
          id: submissionId,
          candidateProfileId: profileId,
          jobId: job.id,
          companyId: job.companyId,
          agencyId,
          recruiterId: user.id,
          status: 'PENDING_ADMIN_APPROVAL',
          notes: dto.notes ?? null,
          filteredAnswers: JSON.stringify(filteredAnswers),
          isRoleApprovalBypass: usedBypass,
        },
      });
    });

    if (usedBypass) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { bypassQuota: { decrement: 1 } },
      });
    }

    // --- Step 7: post-persist syncs (best-effort) ---
    try {
      await this.prisma.recruiterCandidate.update({
        where: { id: rc.id },
        data: { status: 'submitted' },
      });
    } catch (err: any) {
      this.logger.warn(`RC status sync failed: ${err.message}`);
    }
    try {
      await this.prisma.candidateStage.create({
        data: { submissionId: submission.id, stageName: 'Application Review' },
      });
    } catch (err: any) {
      this.logger.warn(`Interview-stage sync failed: ${err.message}`);
    }

    // --- Step 8: résumé move (stubbed S3) ---
    if (hasRequestResume) {
      const publicUrl = this.s3.moveResumeToPublic(
        dto.candidate.resumeTempKey!,
        dto.candidate.resumeFileName ?? 'resume.pdf',
      );
      await this.prisma.candidateProfile.update({
        where: { id: profileId },
        data: { resumeUpload: publicUrl },
      });
      await this.prisma.recruiterCandidate.update({
        where: { id: rc.id },
        data: { resumeUrl: publicUrl },
      });
    }

    // --- Step 9: auto-approve cascade (fire-and-forget, only if recruiter opted in) ---
    if (user.autoApprove) {
      this.cascade.schedule(submission.id);
    }

    // --- Step 10: analytics + response ---
    this.analytics.track('api_candidate_submitted', user.id, {
      jobId: job.id,
      submissionId: submission.id,
      isRoleApprovalBypass: usedBypass,
    });

    const candidateProfile = await this.prisma.candidateProfile.findUnique({
      where: { id: profileId },
    });

    return {
      candidate: candidateProfile,
      submission,
      recruiterCandidateId: rc.id,
    };
  }

  private filterAndValidateAnswers(answers: ScreeningAnswerDto[]): ScreeningAnswerDto[] {
    for (const a of answers) {
      if ((a.answer ?? '').length > MAX_ANSWER_LENGTH) {
        throw new BadRequestException(MESSAGES.ANSWER_TOO_LONG);
      }
    }
    // INFORMATION-type answers are dropped; the rest are persisted.
    return answers.filter((a) => a.type !== 'INFORMATION');
  }

  private async findOrCreateRecruiterCandidate(recruiterId: string, dto: SubmitCandidateDto) {
    const { candidate } = dto;

    if (candidate.id) {
      const byId = await this.prisma.recruiterCandidate.findUnique({
        where: { id: candidate.id },
      });
      if (byId && byId.recruiterId === recruiterId) return byId;
    }

    if (candidate.linkedin) {
      const byLinkedin = await this.prisma.recruiterCandidate.findFirst({
        where: { recruiterId, linkedin: candidate.linkedin },
      });
      if (byLinkedin) return byLinkedin;
    }

    return this.prisma.recruiterCandidate.create({
      data: {
        id: uuidv4(),
        recruiterId,
        name: candidate.name,
        email: candidate.email,
        linkedin: candidate.linkedin ?? null,
        resumeUrl: candidate.resumeUrl ?? null,
        status: 'new',
      },
    });
  }

  private isJobExclusivityActive(job: {
    exclusivityStart: Date | null;
    exclusivityEnd: Date | null;
  }): boolean {
    if (!job.exclusivityStart || !job.exclusivityEnd) return false;
    const now = new Date();
    return now >= job.exclusivityStart && now <= job.exclusivityEnd;
  }
}
