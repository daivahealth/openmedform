import { Module } from '@nestjs/common';
import { FormQuotaService } from './form-quota.service';
import { SettingsModule } from '../settings/settings.module';

/**
 * Deliberately tiny, and deliberately depends on nothing in the form or
 * conversion modules: both of those import it, and `FormModule` already
 * imports `FormConversionModule`, so anything heavier here would close a cycle.
 */
@Module({
  imports: [SettingsModule],
  providers: [FormQuotaService],
  exports: [FormQuotaService],
})
export class FormQuotaModule {}
