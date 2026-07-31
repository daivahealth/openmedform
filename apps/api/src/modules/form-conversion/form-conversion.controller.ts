import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FormEngine } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';
import { decodeUploadFilename } from '../../common/utils/filename';
import { FormConversionService } from './form-conversion.service';

const SUPPORTED = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/html',
];

/**
 * HTML is plain text, so a legitimate single-page mock-up is orders of
 * magnitude smaller than a scanned PDF. A much tighter cap keeps a pathological
 * file (deeply nested or generated markup) from reaching the parser at all.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

@Controller('conversions')
export class FormConversionController {
  constructor(private readonly conversion: FormConversionService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!SUPPORTED.includes(file.mimetype)) {
          cb(
            new BadRequestException(
              'Only PDF, HTML, PNG, JPEG, WebP, or GIF files are accepted',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  start(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('engine') engine: string,
    @Ip() ip: string,
    @Body('provider') provider?: string,
    @Body('instructions') instructions?: string,
  ) {
    if (!file) {
      throw new BadRequestException('A source file is required');
    }
    const engineTarget = (engine ?? 'JSONFORMS').toUpperCase();
    if (engineTarget !== 'FORMIO' && engineTarget !== 'JSONFORMS') {
      throw new BadRequestException('engine must be "formio" or "jsonforms"');
    }

    if (file.mimetype === 'text/html') {
      // HTML mock-ups convert only to the jsonforms engine; the Form.io path
      // takes PDFs and images only.
      if (engineTarget !== 'JSONFORMS') {
        throw new BadRequestException(
          'HTML mock-ups can only be converted with the JSON Forms engine.',
        );
      }
      if (file.size > MAX_HTML_BYTES) {
        throw new BadRequestException(
          `HTML files are limited to ${MAX_HTML_BYTES / 1024 / 1024}MB (this one is ${(file.size / 1024 / 1024).toFixed(1)}MB). A single-page form mock-up should be far smaller.`,
        );
      }
    }

    return this.conversion.startConversion(
      user.tenantId,
      user.userId,
      {
        fileBuffer: file.buffer,
        fileName: decodeUploadFilename(file.originalname),
        mimeType: file.mimetype,
        engineTarget: engineTarget as FormEngine,
        providerName: provider,
        instructions,
      },
      ip,
    );
  }

  @Post(':id/accept')
  accept(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ) {
    return this.conversion.acceptJob(user.tenantId, user.userId, id, ip);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.conversion.listJobs(user.tenantId);
  }

  @Get(':id')
  get(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversion.getJob(user.tenantId, id);
  }
}
