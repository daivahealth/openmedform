import {
  Body,
  Controller,
  Get,
  Ip,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { AUTH_THROTTLE } from '../../common/throttle.config';
import { Request, Response } from 'express';
import { Tenant, User } from '@prisma/client';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ExchangeCodeDto } from './dto/exchange-code.dto';
import { GoogleAuthExceptionFilter } from './google-auth.filter';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GoogleAuthGuard } from '../../common/guards/google-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto, ip);
  }

  /** Starts the Google OAuth2 handshake (redirects to Google). */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // Guard performs the redirect; nothing to do here.
  }

  /**
   * Google OAuth2 callback. On success, issues an app JWT and redirects to the
   * web callback page with the token. On any failure, the filter redirects to
   * the web login page with an error message instead.
   */
  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @UseFilters(GoogleAuthExceptionFilter)
  async googleCallback(
    @Req() req: Request & { user: User & { tenant: Tenant } },
    @Res() res: Response,
    @Ip() ip: string,
  ) {
    await this.authService.googleLogin(req.user, ip);
    // A one-time code, never the access token. The URL this builds ends up in
    // browser history, Referer headers and every access log on the way — a
    // 24-hour credential must not be in it. See createExchangeCode.
    const code = await this.authService.createExchangeCode(req.user.id);
    const frontendOrigin =
      this.config.get<string>('FRONTEND_ORIGIN') || 'http://localhost:3000';
    const target = new URL('/auth/callback', frontendOrigin);
    target.searchParams.set('code', code);
    res.redirect(target.toString());
  }

  /**
   * Trade the redirect's one-time code for a session.
   *
   * Throttled with the credential tier: the code is 256 bits of randomness, so
   * guessing is not the threat, but this is an unauthenticated endpoint that
   * touches the database and should not be free to hammer.
   */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('exchange')
  exchange(@Body() dto: ExchangeCodeDto, @Ip() ip: string) {
    return this.authService.exchangeCode(dto.code, ip);
  }

  @Get('me')
  getProfile(@CurrentUser('userId') userId: string) {
    return this.authService.getProfile(userId);
  }
}
