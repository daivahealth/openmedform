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
import { FormConversionService } from '../form-conversion/form-conversion.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';
import { Throttle } from '@nestjs/throttler';
import { AI_THROTTLE, UPLOAD_THROTTLE } from '../../common/throttle.config';

const ASSET_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
];

@Controller('forms')
export class FormController {
  constructor(
    private readonly formService: FormService,
    private readonly formConversion: FormConversionService,
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

  /**
   * Create a form from a natural-language prompt (e.g. "build a pre-anaesthesia
   * checkup form"). Emits the separated Data/UI/Print schemas via the same
   * generator the file-conversion pipeline uses, creates a draft (subject to the
   * per-user quota) and returns it for review in the designer.
   */
  @Throttle(AI_THROTTLE)
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

    const { form, warnings } = await this.formConversion.createFromPrompt(
      user.tenantId,
      user.userId,
      {
        name: body.name.trim(),
        prompt: body.prompt.trim(),
        category: body.category?.trim(),
        providerName: body.provider,
      },
    );

    return { form, warnings };
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

  @Throttle(UPLOAD_THROTTLE)
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

  @Throttle(UPLOAD_THROTTLE)
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
