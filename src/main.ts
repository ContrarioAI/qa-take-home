import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Serve the thin recruiter form at /. Resolved from cwd so it works regardless
  // of the compiled dist layout.
  app.useStaticAssets(join(process.cwd(), 'public'));
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ATS mimic listening on http://localhost:${port}`);
}
bootstrap();
