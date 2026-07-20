import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AtsModule } from './ats/ats.module';
import { TestModule } from './test-support/test.module';

@Module({
  imports: [PrismaModule, IntegrationsModule, AtsModule, TestModule],
})
export class AppModule {}
