import { Module } from '@nestjs/common';
import { AtsController } from './ats.controller';
import { SubmissionCreationService } from './submission-creation.service';
import { CascadeService } from './cascade.service';

@Module({
  controllers: [AtsController],
  providers: [SubmissionCreationService, CascadeService],
  exports: [CascadeService],
})
export class AtsModule {}
