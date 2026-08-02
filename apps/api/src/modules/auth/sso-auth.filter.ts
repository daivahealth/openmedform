import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

/**
 * SSO failures (denied consent, unknown email, ambiguous account, no verified
 * address) must never surface as raw API error JSON — the user arrived via a
 * browser redirect, so send them back to the web login page with an error
 * query param.
 *
 * Shared by every provider: the login page renders one error banner, and it
 * should not care which button the user pressed.
 */
@Catch()
export class SsoAuthExceptionFilter implements ExceptionFilter {
  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const frontendOrigin =
      this.config.get<string>('FRONTEND_ORIGIN') || 'http://localhost:3000';

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Sign-in failed';

    const target = new URL('/login', frontendOrigin);
    target.searchParams.set('error', 'sso');
    target.searchParams.set('message', message);
    res.redirect(target.toString());
  }
}
