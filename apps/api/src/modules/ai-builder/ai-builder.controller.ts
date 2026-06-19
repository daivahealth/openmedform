import { Body, Controller, Get, Post } from '@nestjs/common';
import { AiBuilderService } from './ai-builder.service';
import { GenerateFormDto } from './dto/generate-form.dto';
import { RefineFormDto } from './dto/refine-form.dto';

@Controller('ai')
export class AiBuilderController {
  constructor(private readonly aiBuilderService: AiBuilderService) {}

  @Post('generate')
  generate(@Body() dto: GenerateFormDto) {
    return this.aiBuilderService.generate(
      dto.prompt,
      dto.provider,
      dto.category,
    );
  }

  @Post('refine')
  refine(@Body() dto: RefineFormDto) {
    return this.aiBuilderService.refine(
      dto.currentSchema,
      dto.instruction,
      dto.conversationHistory,
      dto.provider,
    );
  }

  @Get('providers')
  listProviders() {
    const providers = this.aiBuilderService.listProviders();
    return { providers };
  }
}
