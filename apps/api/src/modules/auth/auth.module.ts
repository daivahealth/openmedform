import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserAwareThrottlerGuard } from '../../common/guards/throttler.guard';
import { DEFAULT_THROTTLE } from '../../common/throttle.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRY', '24h'),
        },
      }),
    }),
    ThrottlerModule.forRoot([DEFAULT_THROTTLE]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // Google SSO is optional: the strategy is only constructed (and registered
    // with passport) when GOOGLE_CLIENT_ID is present, so local dev and
    // password-only deployments boot without Google config.
    {
      provide: GoogleStrategy,
      inject: [ConfigService, AuthService],
      useFactory: (config: ConfigService, authService: AuthService) => {
        const clientId = config.get<string>('GOOGLE_CLIENT_ID');
        if (!clientId || clientId === 'CHANGE_ME') {
          return null;
        }
        return new GoogleStrategy(config, authService);
      },
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Registered LAST on purpose: UserAwareThrottlerGuard keys by req.user,
    // which JwtAuthGuard populates. Moving it earlier silently downgrades every
    // per-user limit to per-IP.
    { provide: APP_GUARD, useClass: UserAwareThrottlerGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
