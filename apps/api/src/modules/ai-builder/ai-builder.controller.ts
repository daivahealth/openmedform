import { Controller, Get } from '@nestjs/common';
import { ProviderRegistry } from './providers/provider-registry';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';

/**
 * What remains of the AI builder surface after the Form.io engine was removed.
 *
 * The schema-generation endpoints (`generate`, `generate-from-pdf`, `refine`)
 * emitted Form.io component trees and are gone. Form creation now runs through
 * the conversion pipeline (`POST /api/conversions`) and the prompt-based
 * designer (`POST /api/forms/:id/jsonforms/refine`), both of which emit the
 * separated Data/UI/Print schemas.
 *
 * Provider discovery is engine-independent, so it stays here — the settings and
 * conversion UIs both read it to populate their provider pickers.
 */
@Controller('ai')
export class AiBuilderController {
  constructor(private readonly providerRegistry: ProviderRegistry) {}

  @Get('providers')
  async listProviders(@CurrentUser() user: RequestUser) {
    const set = await this.providerRegistry.getProvidersForTenant(user.tenantId);
    return { providers: this.providerRegistry.listProviderNames(set) };
  }
}
