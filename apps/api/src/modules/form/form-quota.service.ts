/**
 * The per-user form creation quota, and its enforcement.
 *
 * WHY IT IS ITS OWN SERVICE — this used to be private to `FormService`, which
 * meant only the two routes on `FormController` that happened to call it were
 * covered. Every OTHER way to create a form — the AI conversion pipeline, the
 * prompt generator, template import — silently bypassed it, including the
 * route the UI actually uses. Two of those spend the operator's LLM tokens.
 *
 * `FormModule` already imports `FormConversionModule` (its controller delegates
 * the prompt path), so `FormConversionModule` cannot import `FormModule` back
 * without a cycle. Hence a small module of its own that both can depend on.
 * The quota is a platform-wide cost control; it does not belong to whichever
 * feature happened to implement it first.
 */

import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiProviderConfigService } from '../settings/ai-provider-config.service';

/**
 * Per-user form creation quota. Users start with DEFAULT_FORM_LIMIT; a
 * SUPER_ADMIN can raise an individual limit via /api/admin (stored on
 * user.formLimit; null = default). SUPER_ADMIN is exempt.
 */
export const DEFAULT_FORM_LIMIT = 5;
export const FORM_LIMIT_CONTACT_EMAIL = 'sajithchandran@gmail.com';

/**
 * A tenant that has configured at least one of its OWN active AI providers
 * (Settings -> AI Providers) pays for its own AI usage, so the free-tier form
 * cap no longer applies — the limit exists to bound platform-funded AI spend,
 * not form count itself. This must be checked against the tenant's OWN
 * AiProviderConfig rows only, never the resolved provider set (which also
 * falls back to the platform-wide global config and env vars) — otherwise a
 * configured global fallback would silently make every tenant unlimited.
 */
export interface FormQuota {
  used: number;
  /** null when unlimited. */
  limit: number | null;
  /** null when unlimited. */
  remaining: number | null;
  unlimited: boolean;
  reason: 'super-admin' | 'own-ai-provider' | 'default' | 'admin-raised';
}

@Injectable()
export class FormQuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProviderConfigService: AiProviderConfigService,
  ) {}

  async getFormQuota(userId: string): Promise<FormQuota> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true, formLimit: true, tenantId: true },
    });

    if (user.role === 'SUPER_ADMIN') {
      return { used: 0, limit: null, remaining: null, unlimited: true, reason: 'super-admin' };
    }

    const used = await this.prisma.form.count({ where: { createdById: userId } });

    // Checked against the tenant's OWN AiProviderConfig rows only — see the
    // FormQuota doc comment for why the resolved (tenant->global->env)
    // provider set must never be used for this check.
    const hasOwnProvider = await this.aiProviderConfigService.hasOwnActiveProvider(
      user.tenantId,
    );
    if (hasOwnProvider) {
      return { used, limit: null, remaining: null, unlimited: true, reason: 'own-ai-provider' };
    }

    const limit = user.formLimit ?? DEFAULT_FORM_LIMIT;
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      unlimited: false,
      reason: user.formLimit != null ? 'admin-raised' : 'default',
    };
  }

  /**
   * Enforce the quota (see getFormQuota).
   *
   * Call this BEFORE any provider call, never after: a user who is already at
   * their limit should be refused without first spending tokens on work that
   * is about to be thrown away.
   */
  async assertFormLimit(userId: string): Promise<void> {
    const quota = await this.getFormQuota(userId);
    if (!quota.unlimited && quota.used >= (quota.limit as number)) {
      throw new ForbiddenException(
        `You have reached the maximum of ${quota.limit} forms. Please contact the admin at ${FORM_LIMIT_CONTACT_EMAIL} to increase your limit.`,
      );
    }
  }
}
