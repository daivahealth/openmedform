import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

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
  private readonly logger = new Logger(SsoAuthExceptionFilter.name);

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const frontendOrigin =
      this.config.get<string>('FRONTEND_ORIGIN') || 'http://localhost:3000';

    /**
     * Two very different things land here, and the redirect makes them look
     * identical to the user.
     *
     * An HttpException is a decision we made on purpose — the email is
     * unknown, the account is ambiguous, Azure returned no mailbox. Its
     * message is written for the user and is already on its way to them.
     * Normal operation; worth a line, not an alert.
     *
     * Anything else is a fault: the database is unreachable, the token
     * exchange failed, a provider library threw. The user gets the generic
     * "Sign-in failed" because we have nothing safe to tell them, and that
     * string is all anyone outside the process can see. This filter used to
     * swallow those silently, so a 13-day production database outage was
     * indistinguishable from a user cancelling at the consent screen and left
     * no trace in the logs at all. Log the stack, loudly.
     *
     * The request path only — never `req.url`, which on a callback still
     * carries the provider's authorization `code`.
     */
    const expected = exception instanceof HttpException;
    const message = expected ? exception.message : 'Sign-in failed';

    if (expected) {
      this.logger.warn(`${req.path}: sign-in refused — ${message}`);
    } else {
      this.logger.error(
        `${req.path}: sign-in failed unexpectedly; the user was sent back to ` +
          `the login page with the generic message`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const target = new URL('/login', frontendOrigin);
    target.searchParams.set('error', 'sso');
    target.searchParams.set('message', message);
    res.redirect(target.toString());
  }
}
