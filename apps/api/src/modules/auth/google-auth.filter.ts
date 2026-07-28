import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

/**
 * Google SSO failures (denied consent, unknown email, ambiguous account) must
 * never surface as raw API error JSON — the user arrived via a browser
 * redirect, so send them back to the web login page with an error query param.
 */
@Catch()
export class GoogleAuthExceptionFilter implements ExceptionFilter {
  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const frontendOrigin =
      this.config.get<string>('FRONTEND_ORIGIN') || 'http://localhost:3000';

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Google sign-in failed';

    const target = new URL('/login', frontendOrigin);
    target.searchParams.set('error', 'google_sso');
    target.searchParams.set('message', message);
    res.redirect(target.toString());
  }
}
