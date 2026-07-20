import { Injectable } from '@nestjs/common';

export type RecorderService_Name = 's3' | 'kombo' | 'slack' | 'analytics';

export interface RecordedCall {
  seq: number;
  service: RecorderService_Name;
  event: string;
  payload: Record<string, any>;
  timestamp: string; // ISO
}

/**
 * Central in-memory log of every stubbed side effect. Injected into each stub
 * service. Exposed to tests via GET /test/recorders and cleared on POST /test/reset.
 */
@Injectable()
export class RecorderService {
  private seq = 0;
  private calls: RecordedCall[] = [];

  record(service: RecorderService_Name, event: string, payload: Record<string, any>): void {
    this.calls.push({
      seq: this.seq++,
      service,
      event,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  /** All calls in monotonic sequence order. */
  all(): RecordedCall[] {
    return [...this.calls];
  }

  /** Calls grouped by service, the shape GET /test/recorders returns. */
  grouped(): Record<RecorderService_Name, RecordedCall[]> {
    const grouped: Record<RecorderService_Name, RecordedCall[]> = {
      s3: [],
      kombo: [],
      slack: [],
      analytics: [],
    };
    for (const call of this.calls) {
      grouped[call.service].push(call);
    }
    return grouped;
  }

  clear(): void {
    this.seq = 0;
    this.calls = [];
  }
}
