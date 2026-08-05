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
import { TerminologyService, type TerminologySystem } from './terminology.service';
import { CodingSuggestService } from './coding-suggest.service';

const SEARCHABLE_SYSTEMS: TerminologySystem[] = ['loinc', 'icd10', 'snomed'];

@Controller()
export class TerminologyController {
  constructor(
    private readonly terminology: TerminologyService,
    private readonly suggest: CodingSuggestService,
  ) {}

  /**
   * Which terminology systems this tenant can use, with reasons when one is
   * off — the dictionary reads this to shape its search UI. The SNOMED
   * licensing gate is enforced server-side; this endpoint only reports it.
   */
  @Get('terminology/systems')
  systems(@CurrentUser() user: RequestUser) {
    return this.terminology.systemsForTenant(user.tenantId);
  }

  /**
   * Dictionary search box: top candidates for what the user typed, in the
   * chosen system. LOINC/ICD-10 search local tables; SNOMED proxies the
   * configured FHIR terminology server and is tenant-gated.
   */
  @Get('terminology/search')
  async search(
    @CurrentUser() user: RequestUser,
    @Query('system') system?: string,
    @Query('q') q?: string,
  ) {
    if (!SEARCHABLE_SYSTEMS.includes(system as TerminologySystem)) {
      throw new BadRequestException(`system must be one of: ${SEARCHABLE_SYSTEMS.join(', ')}`);
    }
    const query = (q ?? '').trim();
    if (query.length > 200) throw new BadRequestException('query too long');
    if (query.length < 2) return { candidates: [] };

    if (system === 'snomed') {
      if (!(await this.terminology.snomedAvailable(user.tenantId))) {
        throw new BadRequestException(
          'SNOMED CT is not available for this organization (licensing/configuration).',
        );
      }
      return { candidates: await this.terminology.searchSnomed(query) };
    }
    if (system === 'icd10') return { candidates: await this.terminology.searchIcd10(query) };
    return { candidates: await this.terminology.searchLoinc(query) };
  }

  /**
   * Back-compat for the pre-P3 dictionary build: LOINC-only search.
   * @deprecated use /terminology/search?system=loinc
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
