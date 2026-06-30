import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { encrypt, decrypt, maskApiKey } from '../../common/utils/crypto';

const VALID_PROVIDERS = ['claude', 'openai', 'minimax', 'kimi', 'ollama'];

interface CreateProviderInput {
  provider: string;
  displayName: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  isDefault?: boolean;
}

interface UpdateProviderInput {
  displayName?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

@Injectable()
export class AiProviderConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    const configs = await this.prisma.aiProviderConfig.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });

    return configs.map((c) => ({
      id: c.id,
      provider: c.provider,
      displayName: c.displayName,
      apiKeyMasked: maskApiKey(decrypt(c.apiKey)),
      model: c.model,
      baseUrl: c.baseUrl,
      isDefault: c.isDefault,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async create(tenantId: string, input: CreateProviderInput) {
    if (!VALID_PROVIDERS.includes(input.provider)) {
      throw new BadRequestException(
        `Invalid provider "${input.provider}". Valid: ${VALID_PROVIDERS.join(', ')}`,
      );
    }

    if (input.provider === 'ollama' && !input.baseUrl) {
      throw new BadRequestException('Ollama provider requires a base URL');
    }

    const existing = await this.prisma.aiProviderConfig.findUnique({
      where: {
        uq_ai_provider_tenant: { tenantId, provider: input.provider },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Provider "${input.provider}" is already configured`,
      );
    }

    if (input.isDefault) {
      await this.prisma.aiProviderConfig.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const config = await this.prisma.aiProviderConfig.create({
      data: {
        tenantId,
        provider: input.provider,
        displayName: input.displayName,
        apiKey: encrypt(input.apiKey),
        model: input.model,
        baseUrl: input.baseUrl,
        isDefault: input.isDefault ?? false,
      },
    });

    return {
      id: config.id,
      provider: config.provider,
      displayName: config.displayName,
      apiKeyMasked: maskApiKey(input.apiKey),
      model: config.model,
      baseUrl: config.baseUrl,
      isDefault: config.isDefault,
      isActive: config.isActive,
    };
  }

  async update(tenantId: string, id: string, input: UpdateProviderInput) {
    const config = await this.prisma.aiProviderConfig.findFirst({
      where: { id, tenantId },
    });
    if (!config) throw new NotFoundException('Provider config not found');

    if (input.isDefault) {
      await this.prisma.aiProviderConfig.updateMany({
        where: { tenantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const data: Record<string, unknown> = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.apiKey !== undefined) data.apiKey = encrypt(input.apiKey);
    if (input.model !== undefined) data.model = input.model;
    if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl;
    if (input.isDefault !== undefined) data.isDefault = input.isDefault;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const updated = await this.prisma.aiProviderConfig.update({
      where: { id },
      data,
    });

    return {
      id: updated.id,
      provider: updated.provider,
      displayName: updated.displayName,
      apiKeyMasked: maskApiKey(decrypt(updated.apiKey)),
      model: updated.model,
      baseUrl: updated.baseUrl,
      isDefault: updated.isDefault,
      isActive: updated.isActive,
    };
  }

  async remove(tenantId: string, id: string) {
    const config = await this.prisma.aiProviderConfig.findFirst({
      where: { id, tenantId },
    });
    if (!config) throw new NotFoundException('Provider config not found');

    await this.prisma.aiProviderConfig.delete({ where: { id } });
    return { deleted: true };
  }

  async getDecryptedConfigs(tenantId: string) {
    const configs = await this.prisma.aiProviderConfig.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    return configs.map((c) => ({
      ...c,
      apiKey: decrypt(c.apiKey),
    }));
  }
}
