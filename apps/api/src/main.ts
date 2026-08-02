import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
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

  // The API serves JSON and uploaded binaries, never HTML pages of its own, so
  // the defaults can be strict. A CSP of "nothing is allowed" is exactly right
  // here: it costs nothing for a JSON response and neutralises anything a
  // stored file might try if a browser is ever pointed straight at it.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          sandbox: [],
        },
      },
      // Nothing here is meant to be framed or sniffed.
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // Only meaningful over HTTPS; harmless locally, and Cloud Run terminates
      // TLS in front of us.
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: false },
      // Cross-origin reads are already gated by CORS + bearer auth; this stops
      // another origin embedding our responses as a resource.
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

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
