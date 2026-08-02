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
import { SsoAuthExceptionFilter } from './sso-auth.filter';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GoogleAuthGuard } from '../../common/guards/google-auth.guard';
import { MicrosoftAuthGuard } from '../../common/guards/microsoft-auth.guard';

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
  @UseFilters(SsoAuthExceptionFilter)
  async googleCallback(
    @Req() req: Request & { user: User & { tenant: Tenant } },
    @Res() res: Response,
    @Ip() ip: string,
  ) {
    await this.completeSsoLogin('google', req.user, res, ip);
  }

  /** Starts the Microsoft (Entra ID) handshake. */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Get('microsoft')
  @UseGuards(MicrosoftAuthGuard)
  microsoftLogin() {
    // Guard performs the redirect; nothing to do here.
  }

  @Public()
  @Get('microsoft/callback')
  @UseGuards(MicrosoftAuthGuard)
  @UseFilters(SsoAuthExceptionFilter)
  async microsoftCallback(
    @Req() req: Request & { user: User & { tenant: Tenant } },
    @Res() res: Response,
    @Ip() ip: string,
  ) {
    await this.completeSsoLogin('microsoft', req.user, res, ip);
  }

  /**
   * Everything after a provider has vouched for the user: issue the session and
   * hand it back to the web app.
   *
   * Shared so the two providers cannot drift. What lands in this redirect is a
   * security decision, and it should be made once.
   */
  private async completeSsoLogin(
    provider: 'google' | 'microsoft',
    user: User & { tenant: Tenant },
    res: Response,
    ip: string,
  ) {
    const session = await this.authService.ssoLogin(provider, user, ip);
    const frontendOrigin =
      this.config.get<string>('FRONTEND_ORIGIN') || 'http://localhost:3000';
    const target = new URL('/auth/callback', frontendOrigin);
    target.searchParams.set('token', session.accessToken);
    res.redirect(target.toString());
  }

  @Get('me')
  getProfile(@CurrentUser('userId') userId: string) {
    return this.authService.getProfile(userId);
  }
}
