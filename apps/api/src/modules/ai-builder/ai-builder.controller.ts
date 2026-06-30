import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiBuilderService } from './ai-builder.service';
import { GenerateFormDto } from './dto/generate-form.dto';
import { RefineFormDto } from './dto/refine-form.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';

@Controller('ai')
export class AiBuilderController {
  constructor(private readonly aiBuilderService: AiBuilderService) {}

  @Post('generate')
  generate(@CurrentUser() user: RequestUser, @Body() dto: GenerateFormDto) {
    return this.aiBuilderService.generate(
      user.tenantId,
      dto.prompt,
      dto.provider,
      dto.category,
    );
  }

  @Post('generate-from-pdf')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(new BadRequestException('Only PDF files are accepted'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async generateFromPdf(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('provider') provider?: string,
    @Body('instructions') instructions?: string,
  ) {
    if (!file) {
      throw new BadRequestException('PDF file is required');
    }

    return this.aiBuilderService.generateFromPdf(
      user.tenantId,
      file.buffer,
      provider,
      instructions,
    );
  }

  @Post('refine')
  refine(@CurrentUser() user: RequestUser, @Body() dto: RefineFormDto) {
    return this.aiBuilderService.refine(
      user.tenantId,
      dto.currentSchema,
      dto.instruction,
      dto.conversationHistory,
      dto.provider,
    );
  }

  @Get('providers')
  async listProviders(@CurrentUser() user: RequestUser) {
    const providers = await this.aiBuilderService.listProviders(user.tenantId);
    return { providers };
  }
}
