import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { SubmissionCreationService } from './submission-creation.service';
import { SubmitCandidateDto } from './dto/submit-candidate.dto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('ats')
export class AtsController {
  constructor(
    private readonly submissions: SubmissionCreationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('submit-candidate')
  @HttpCode(200)
  async submitCandidate(
    @Headers('x-user-id') userId: string | undefined,
    @Body() body: SubmitCandidateDto,
  ) {
    return this.submissions.createSubmission(userId, body);
  }

  /**
   * Read a submission with its profile + stages. Lets tests assert persisted
   * status transitions (e.g. the fire-and-forget cascade advancing to APPROVED)
   * and the CandidateStage rows.
   */
  @Get('submissions/:id')
  async getSubmission(@Param('id') id: string) {
    const submission = await this.prisma.candidateSubmission.findUnique({
      where: { id },
      include: { candidateProfile: true, stages: true },
    });
    if (!submission) throw new NotFoundException('Submission not found.');
    return submission;
  }
}
