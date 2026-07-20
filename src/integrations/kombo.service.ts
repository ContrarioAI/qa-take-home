import { Injectable } from '@nestjs/common';
import { RecorderService } from './recorder.service';

/**
 * Stubbed Kombo (external ATS). Only invoked for Kombo-sourced jobs inside the
 * auto-approve cascade. Records the push attempt including any block reason.
 */
@Injectable()
export class KomboService {
  constructor(private readonly recorder: RecorderService) {}

  push(params: { jobId: string; candidateId: string; blockedReason?: string }): void {
    this.recorder.record('kombo', 'push_candidate', {
      jobId: params.jobId,
      candidateId: params.candidateId,
      blockedReason: params.blockedReason ?? null,
      pushed: !params.blockedReason,
    });
  }
}
