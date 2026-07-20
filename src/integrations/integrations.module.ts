import { Global, Module } from '@nestjs/common';
import { RecorderService } from './recorder.service';
import { S3Service } from './s3.service';
import { KomboService } from './kombo.service';
import { SlackService } from './slack.service';
import { AnalyticsService } from './analytics.service';

@Global()
@Module({
  providers: [RecorderService, S3Service, KomboService, SlackService, AnalyticsService],
  exports: [RecorderService, S3Service, KomboService, SlackService, AnalyticsService],
})
export class IntegrationsModule {}
