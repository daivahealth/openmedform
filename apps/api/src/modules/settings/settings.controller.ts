import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { AiProviderConfigService } from './ai-provider-config.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly aiProviderConfigService: AiProviderConfigService,
  ) {}

  @Get('ai-providers')
  listProviders(@CurrentUser() user: RequestUser) {
    return this.aiProviderConfigService.findAll(user.tenantId);
  }

  @Post('ai-providers')
  createProvider(
    @CurrentUser() user: RequestUser,
    @Body()
    body: {
      provider: string;
      displayName: string;
      apiKey: string;
      model?: string;
      baseUrl?: string;
      isDefault?: boolean;
    },
  ) {
    return this.aiProviderConfigService.create(user.tenantId, body);
  }

  @Put('ai-providers/:id')
  updateProvider(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      displayName?: string;
      apiKey?: string;
      model?: string;
      baseUrl?: string;
      isDefault?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.aiProviderConfigService.update(user.tenantId, id, body);
  }

  @Delete('ai-providers/:id')
  deleteProvider(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.aiProviderConfigService.remove(user.tenantId, id);
  }
}
