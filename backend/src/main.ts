import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  const port = process.env.PORT ?? 5000;
  await app.listen(port);

  logger.log(`Server running at http://localhost:${port}/api/v1`);
  logger.log(`Health endpoint for UptimeRobot: http://localhost:${port}/health`);
}

await bootstrap();
