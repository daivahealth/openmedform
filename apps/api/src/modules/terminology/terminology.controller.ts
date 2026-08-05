import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AI_THROTTLE } from '../../common/throttle.config';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';
import { TerminologyService } from './terminology.service';
import { CodingSuggestService } from './coding-suggest.service';

@Controller()
export class TerminologyController {
  constructor(
    private readonly terminology: TerminologyService,
    private readonly suggest: CodingSuggestService,
  ) {}

  /**
   * Dictionary search box: top LOINC candidates for what the user typed.
   * Reference data, so no tenant scoping — but auth still applies.
   */
  @Get('terminology/loinc')
  async searchLoinc(@Query('q') q?: string) {
    const query = (q ?? '').trim();
    if (query.length < 2) return { candidates: [], loaded: await this.terminology.loincCount() };
    if (query.length > 200) throw new BadRequestException('query too long');
    return {
      candidates: await this.terminology.searchLoinc(query),
      loaded: await this.terminology.loincCount(),
    };
  }

  /**
   * The dictionary's "Suggest codes" button: run the retrieve-then-select pass
   * over every uncoded field of the form's draft. AI-tier throttled — it is
   * one LLM call.
   */
  @Throttle(AI_THROTTLE)
  @Post('forms/:id/coding/suggest')
  suggestForForm(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { provider?: string } | undefined,
    @Ip() ip: string,
  ) {
    return this.suggest.suggestForForm(user.tenantId, id, {
      providerName: body?.provider,
      ipAddress: ip,
      userId: user.userId,
    });
  }
}
