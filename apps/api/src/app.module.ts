import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './common/audit/audit.module';
import { ValidationModule } from './modules/validation/validation.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UserModule } from './modules/user/user.module';
import { FormModule } from './modules/form/form.module';
import { SubmissionModule } from './modules/submission/submission.module';
import { HealthModule } from './modules/health/health.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { AiBuilderModule } from './modules/ai-builder/ai-builder.module';
import { FormConversionModule } from './modules/form-conversion/form-conversion.module';
import { DesignerModule } from './modules/designer/designer.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuditModule,
    ValidationModule,
    AuthModule,
    TenantModule,
    UserModule,
    FormModule,
    SubmissionModule,
    ScoringModule,
    AiBuilderModule,
    FormConversionModule,
    DesignerModule,
    SettingsModule,
    HealthModule,
  ],
})
export class AppModule {}
