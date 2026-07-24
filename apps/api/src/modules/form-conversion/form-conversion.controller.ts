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
];

@Controller('conversions')
export class FormConversionController {
  constructor(private readonly conversion: FormConversionService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!SUPPORTED.includes(file.mimetype)) {
          cb(new BadRequestException('Only PDF, PNG, JPEG, WebP, or GIF files are accepted'), false);
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
