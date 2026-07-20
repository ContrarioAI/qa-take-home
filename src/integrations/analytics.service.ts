import { Injectable } from '@nestjs/common';
import { RecorderService } from './recorder.service';

/**
 * Stubbed PostHog. Records every analytics event so tests can assert the
 * submitted / failed / collision events fire (and who they're attributed to).
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly recorder: RecorderService) {}

  track(event: string, attributedTo: string, payload: Record<string, any> = {}): void {
    this.recorder.record('analytics', event, {
      name: event,
      attributedTo,
      payload,
    });
  }
}
