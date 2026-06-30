import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { FormType } from '@prisma/client';
import { FormService } from './form.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { SaveSchemaDto } from './dto/save-schema.dto';
import { RefineFormAgentDto } from './dto/refine-form-agent.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';
import { AiBuilderService } from '../ai-builder/ai-builder.service';

const SUPPORTED_SOURCE_FILE_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

function isSupportedSourceFile(mimetype: string) {
  return SUPPORTED_SOURCE_FILE_TYPES.includes(mimetype);
}

function sourceFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!isSupportedSourceFile(file.mimetype)) {
    cb(
      new BadRequestException(
        'Only PDF, PNG, JPEG, WebP, or GIF files are accepted',
      ),
      false,
    );
    return;
  }
  cb(null, true);
}

@Controller('forms')
export class FormController {
  constructor(
    private readonly formService: FormService,
    private readonly aiBuilderService: AiBuilderService,
  ) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateFormDto) {
    return this.formService.create(user.tenantId, user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.formService.findAll(user.tenantId);
  }

  @Post('from-pdf')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: sourceFileFilter,
    }),
  )
  createFromPdfAlias(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('description') description?: string,
    @Body('category') category?: string,
    @Body('formType') formType?: FormType,
    @Body('provider') provider?: string,
    @Body('instructions') instructions?: string,
  ) {
    return this.createFromSourceFile(
      user,
      file,
      name,
      description,
      category,
      formType,
      provider,
      instructions,
    );
  }

  @Post('from-file')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: sourceFileFilter,
    }),
  )
  async createFromFile(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('description') description?: string,
    @Body('category') category?: string,
    @Body('formType') formType?: FormType,
    @Body('provider') provider?: string,
    @Body('instructions') instructions?: string,
  ) {
    return this.createFromSourceFile(
      user,
      file,
      name,
      description,
      category,
      formType,
      provider,
      instructions,
    );
  }

  private async createFromSourceFile(
    user: RequestUser,
    file: Express.Multer.File,
    name: string,
    description?: string,
    category?: string,
    formType?: FormType,
    provider?: string,
    instructions?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Source file is required');
    }
    if (!name?.trim()) {
      throw new BadRequestException('Form name is required');
    }

    const result =
      file.mimetype === 'application/pdf'
        ? await this.aiBuilderService.generateFromPdf(
            user.tenantId,
            file.buffer,
            provider,
            instructions,
          )
        : await this.aiBuilderService.generateFromImage(
            user.tenantId,
            file.buffer,
            file.mimetype,
            provider,
            instructions,
          );

    const form = await this.formService.createWithSchema(
      user.tenantId,
      user.userId,
      {
        name: name.trim(),
        description: description?.trim() || undefined,
        category: category?.trim() || undefined,
        formType: formType ?? FormType.PATIENT,
      },
      result.schema,
    );

    return { form, schema: result.schema, provider: result.provider };
  }

  @Get('slug/:slug')
  findBySlug(
    @CurrentUser() user: RequestUser,
    @Param('slug') slug: string,
  ) {
    return this.formService.findBySlug(user.tenantId, slug);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.findOne(user.tenantId, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFormDto,
  ) {
    return this.formService.update(user.tenantId, id, dto);
  }

  @Put(':id/schema')
  saveSchema(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveSchemaDto,
  ) {
    return this.formService.saveSchema(user.tenantId, id, dto.schema);
  }

  @Post(':id/ai/refine')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.mimetype)) {
          cb(new BadRequestException('Only PNG, JPEG, WebP, or GIF images are accepted'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async refineWithAi(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefineFormAgentDto,
    @UploadedFile() image: Express.Multer.File | undefined,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (type: string, data: unknown) => {
      res.write(`data: ${JSON.stringify({ type, ...data as object })}\n\n`);
    };
    const onProgress = (message: string) => sendEvent('progress', { message });

    try {
      await this.formService.findOne(user.tenantId, id);
      const currentSchema =
        this.parseOptionalSchema(dto.currentSchema) ??
        (await this.formService.getLatestSchema(user.tenantId, id));
      const conversationHistory = this.parseOptionalConversationHistory(
        dto.conversationHistory,
      );

      let result: { schema: Record<string, unknown>; provider: string };

      if (image) {
        result = await this.aiBuilderService.refineWithImage(
          user.tenantId,
          currentSchema,
          dto.instruction,
          image.buffer,
          image.mimetype,
          conversationHistory,
          dto.provider,
          onProgress,
        );
      } else {
        result = await this.aiBuilderService.refine(
          user.tenantId,
          currentSchema,
          dto.instruction,
          conversationHistory,
          dto.provider,
          onProgress,
        );
      }

      sendEvent('result', result);
    } catch (err) {
      const message =
        err instanceof BadRequestException
          ? (err.getResponse() as any).message ?? err.message
          : err instanceof Error
            ? err.message
            : 'An unexpected error occurred';
      sendEvent('error', { message });
    }

    res.end();
  }

  private parseOptionalSchema(value: unknown) {
    if (!value) return undefined;
    if (typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as Record<string, unknown>;
      } catch {
        throw new BadRequestException('currentSchema must be valid JSON');
      }
    }
    return undefined;
  }

  private parseOptionalConversationHistory(value: unknown) {
    if (!value) return undefined;
    if (Array.isArray(value)) {
      return value as Array<{ role: string; content: string }>;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as Array<{ role: string; content: string }>;
      } catch {
        throw new BadRequestException('conversationHistory must be valid JSON');
      }
    }
    return undefined;
  }

  @Post(':id/publish')
  publish(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.publish(user.tenantId, id);
  }

  @Post(':id/clone')
  clone(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.clone(user.tenantId, user.userId, id);
  }

  @Get(':id/export')
  exportTemplate(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.exportTemplate(user.tenantId, id);
  }

  @Post('import')
  importTemplate(
    @CurrentUser() user: RequestUser,
    @Body() template: Record<string, unknown>,
  ) {
    return this.formService.importTemplate(
      user.tenantId,
      user.userId,
      template,
    );
  }

  @Get(':id/ai/messages')
  getAiMessages(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.getAiMessages(user.tenantId, id);
  }

  @Post(':id/ai/messages')
  addAiMessage(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { role: string; content: string; provider?: string },
  ) {
    return this.formService.addAiMessage(user.tenantId, id, body);
  }

  @Delete(':id/ai/messages')
  clearAiMessages(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.clearAiMessages(user.tenantId, id);
  }

  @Delete(':id')
  archive(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.archive(user.tenantId, id);
  }
}
