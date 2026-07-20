import { Injectable } from '@nestjs/common';
import { RecorderService } from './recorder.service';

/**
 * Stubbed Slack. Sends the company a candidate-intro notification. Whether the
 * message has action buttons depends on the company's autoApproveAfterAdminApproval.
 */
@Injectable()
export class SlackService {
  constructor(private readonly recorder: RecorderService) {}

  sendCandidateIntro(params: { companyId: string; candidateId: string; hasActionButtons: boolean }): void {
    this.recorder.record('slack', 'candidate_intro', {
      companyId: params.companyId,
      candidateId: params.candidateId,
      hasActionButtons: params.hasActionButtons,
    });
  }
}
