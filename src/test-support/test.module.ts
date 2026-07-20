import { Module } from '@nestjs/common';
import { TestController } from './test.controller';
import { AtsModule } from '../ats/ats.module';

@Module({
  imports: [AtsModule],
  controllers: [TestController],
})
export class TestModule {}
