import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KomboService } from '../integrations/kombo.service';
import { SlackService } from '../integrations/slack.service';

/**
 * The fire-and-forget auto-approve cascade (step 9). It runs AFTER the HTTP
 * response is returned, so callers should NOT await run(); instead run() registers
 * its promise internally and tests wait on it via flush().
 */
@Injectable()
export class CascadeService {
  private readonly logger = new Logger(CascadeService.name);
  private pending: Promise<void>[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly kombo: KomboService,
    private readonly slack: SlackService,
  ) {}

  /** Kick off the cascade without blocking the HTTP response. */
  schedule(submissionId: string): void {
    const p = this.run(submissionId).catch((err) => {
      this.logger.error(`Auto-approve cascade failed for ${submissionId}: ${err.message}`);
    });
    this.pending.push(p);
  }

  /** Test-only: await every scheduled cascade so recorder assertions are race-free. */
  async flush(): Promise<void> {
    const inflight = this.pending;
    this.pending = [];
    await Promise.allSettled(inflight);
  }

  private async run(submissionId: string): Promise<void> {
    const submission = await this.prisma.candidateSubmission.findUnique({
      where: { id: submissionId },
      include: { job: true, company: true, candidateProfile: true },
    });
    if (!submission) return;

    // Move status forward and advance the interview stage.
    await this.prisma.candidateSubmission.update({
      where: { id: submissionId },
      data: { status: 'PENDING_COMPANY_APPROVAL' },
    });
    await this.prisma.candidateStage.create({
      data: { submissionId, stageName: 'Company Review' },
    });

    // Kombo-sourced jobs re-check eligibility + an ATS collision, then push.
    if (submission.job.source === 'kombo') {
      let blockedReason: string | undefined;
      if (!submission.job.active || submission.job.deletedAt) {
        blockedReason = 'inactive_job';
      } else {
        const duplicate = await this.prisma.candidateSubmission.findFirst({
          where: {
            jobId: submission.jobId,
            id: { not: submission.id },
            candidateProfile: { email: submission.candidateProfile.email },
          },
        });
        if (duplicate) blockedReason = 'duplicate_in_ats';
      }

      this.kombo.push({
        jobId: submission.jobId,
        candidateId: submission.candidateProfileId,
        blockedReason,
      });
    }

    // Slack intro to the company; action buttons depend on the company flag.
    this.slack.sendCandidateIntro({
      companyId: submission.companyId,
      candidateId: submission.candidateProfileId,
      hasActionButtons: !submission.company.autoApproveAfterAdminApproval,
    });

    // If company auto-approves after admin approval, cascade further to APPROVED.
    if (submission.company.autoApproveAfterAdminApproval) {
      await this.prisma.candidateSubmission.update({
        where: { id: submissionId },
        data: { status: 'APPROVED' },
      });
    }
  }
}
