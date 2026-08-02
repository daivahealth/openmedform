import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';
import {
  FormQuotaService,
  FORM_LIMIT_CONTACT_EMAIL,
} from '../form/form-quota.service';
import { ProviderRegistry } from '../ai-builder/providers/provider-registry';

/**
 * Status the web app's dashboard notice needs on load: the current user's
 * form-creation quota and which tier (tenant/global/env) is currently serving
 * their AI calls. Read-only aggregate — no domain mutation belongs here.
 */
@Controller('me')
export class WorkspaceController {
  constructor(
    private readonly formQuota: FormQuotaService,
    private readonly providerRegistry: ProviderRegistry,
  ) {}

  @Get('workspace-status')
  async getWorkspaceStatus(@CurrentUser() user: RequestUser) {
    const [quota, effectiveSource] = await Promise.all([
      this.formQuota.getFormQuota(user.userId),
      this.providerRegistry.getEffectiveSource(user.tenantId),
    ]);

    return {
      quota,
      ai: { effectiveSource },
      contactEmail: FORM_LIMIT_CONTACT_EMAIL,
    };
  }
}
