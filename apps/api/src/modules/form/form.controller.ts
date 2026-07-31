import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Ip,
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

const ASSET_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
];

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
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateFormDto,
    @Ip() ip: string,
  ) {
    return this.formService.create(user.tenantId, user.userId, dto, ip);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.formService.findAll(user.tenantId);
  }

  @Get('count')
  async count(@CurrentUser() user: RequestUser) {
    return { count: await this.formService.count(user.tenantId) };
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

  /**
   * Create a form from a natural-language prompt (e.g. "build a pre-anaesthesia
   * checkup form"). Mirrors from-file: AI generates a Form.io schema, then a
   * draft form is created (subject to the per-user quota) and opened in the
   * builder.
   */
  @Post('from-prompt')
  async createFromPrompt(
    @CurrentUser() user: RequestUser,
    @Body()
    body: {
      name: string;
      prompt: string;
      description?: string;
      category?: string;
      formType?: FormType;
      provider?: string;
    },
  ) {
    if (!body?.name?.trim()) {
      throw new BadRequestException('Form name is required');
    }
    if (!body?.prompt?.trim()) {
      throw new BadRequestException('A prompt describing the form is required');
    }
    if (!body?.category?.trim()) {
      throw new BadRequestException('A category is required');
    }

    const result = await this.aiBuilderService.generate(
      user.tenantId,
      body.prompt.trim(),
      body.provider,
      body.category.trim(),
      undefined,
      user.userId,
    );

    const form = await this.formService.createWithSchema(
      user.tenantId,
      user.userId,
      {
        name: body.name.trim(),
        description: body.description?.trim() || undefined,
        category: body.category.trim(),
        formType: body.formType ?? FormType.PATIENT,
      },
      result.schema,
    );

    return { form, schema: result.schema, provider: result.provider };
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
    if (!category?.trim()) {
      throw new BadRequestException('A category is required');
    }

    const result =
      file.mimetype === 'application/pdf'
        ? await this.aiBuilderService.generateFromPdf(
            user.tenantId,
            file.buffer,
            provider,
            instructions,
            user.userId,
          )
        : await this.aiBuilderService.generateFromImage(
            user.tenantId,
            file.buffer,
            file.mimetype,
            provider,
            instructions,
            user.userId,
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
          user.userId,
          id,
        );
      } else {
        result = await this.aiBuilderService.refine(
          user.tenantId,
          currentSchema,
          dto.instruction,
          conversationHistory,
          dto.provider,
          onProgress,
          user.userId,
          id,
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
    @Ip() ip: string,
  ) {
    return this.formService.publish(user.tenantId, id, {
      userId: user.userId,
      ipAddress: ip,
    });
  }

  @Get(':id/versions/:versionId/integrity')
  verifyIntegrity(
    @CurrentUser() user: RequestUser,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.formService.verifyIntegrity(user.tenantId, versionId);
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

  @Get(':id/export/formio')
  exportNativeFormioSchema(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.exportNativeFormioSchema(user.tenantId, id);
  }

  @Post(':id/assets')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ASSET_FILE_TYPES.includes(file.mimetype)) {
          cb(
            new BadRequestException(
              'Assets must be PNG, JPEG, WebP, GIF, SVG, or PDF',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadAsset(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Ip() ip: string,
  ) {
    if (!file) {
      throw new BadRequestException('An asset file is required');
    }
    return this.formService.uploadAsset(user.tenantId, id, file, {
      userId: user.userId,
      ipAddress: ip,
    });
  }

  @Get(':id/assets')
  listAssets(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.listAssets(user.tenantId, id);
  }

  @Get(':id/assets/:assetId')
  async getAsset(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Res() res: Response,
  ) {
    const asset = await this.formService.getAsset(user.tenantId, id, assetId);
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(asset.filename)}"`,
    );
    res.send(asset.data);
  }

  @Delete(':id/assets/:assetId')
  deleteAsset(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Ip() ip: string,
  ) {
    return this.formService.deleteAsset(user.tenantId, id, assetId, {
      userId: user.userId,
      ipAddress: ip,
    });
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

  @Get(':id/deletion-summary')
  deletionSummary(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.deletionSummary(user.tenantId, id);
  }

  @Delete(':id')
  archive(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.formService.archive(user.tenantId, id);
  }

  @Delete(':id/permanent')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ) {
    return this.formService.remove(user.tenantId, id, {
      userId: user.userId,
      ipAddress: ip,
    });
  }
}
