import { Controller, Get, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecorderService } from '../integrations/recorder.service';
import { CascadeService } from '../ats/cascade.service';
import { seedDatabase } from './seed-data';

/**
 * Test-only endpoints. These are the seam that makes the flow assertable:
 * /test/reset controls starting state, /test/recorders reveals side effects.
 */
@Controller('test')
export class TestController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recorder: RecorderService,
    private readonly cascade: CascadeService,
  ) {}

  /** Truncate + re-seed deterministically, and clear all recorders. */
  @Post('reset')
  async reset() {
    const result = await seedDatabase(this.prisma);
    this.recorder.clear();

    const counts = {
      users: await this.prisma.user.count(),
      companies: await this.prisma.company.count(),
      jobs: await this.prisma.job.count(),
      recruiterCandidates: await this.prisma.recruiterCandidate.count(),
      submissions: await this.prisma.candidateSubmission.count(),
    };

    return { ok: true, seedVersion: result.seedVersion, counts };
  }

  /**
   * Dump all recorded side effects, grouped by service.
   * Pass ?awaitPending=true to flush the fire-and-forget cascade first, so
   * assertions on Kombo/Slack/status-advance are race-free.
   */
  @Get('recorders')
  async recorders(@Query('awaitPending') awaitPending?: string) {
    if (awaitPending === 'true') {
      await this.cascade.flush();
    }
    return {
      all: this.recorder.all(),
      grouped: this.recorder.grouped(),
    };
  }
}
