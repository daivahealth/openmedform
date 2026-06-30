import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UserModule } from './modules/user/user.module';
import { FormModule } from './modules/form/form.module';
import { SubmissionModule } from './modules/submission/submission.module';
import { HealthModule } from './modules/health/health.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { AiBuilderModule } from './modules/ai-builder/ai-builder.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    TenantModule,
    UserModule,
    FormModule,
    SubmissionModule,
    ScoringModule,
    AiBuilderModule,
    SettingsModule,
    HealthModule,
  ],
})
export class AppModule {}
