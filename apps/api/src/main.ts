import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind Cloud Run's load balancer, req.ip is the proxy unless Express is
  // told how many hops to trust. Rate limiting keys on the client address, so
  // getting this wrong makes every caller share one bucket. Configurable
  // because the correct number is a property of the deployment, not the code;
  // 0 (the default) means "no proxy", which is right for local dev.
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3100;
  await app.listen(port);
  console.log(`OpenMedForm API running on port ${port}`);
}

bootstrap();
