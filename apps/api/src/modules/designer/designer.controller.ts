import {
  BadRequestException,
  Body,
  Controller,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';
import { DesignerService } from './designer.service';
import type { ImageContent } from '../ai-builder/providers/llm-provider.interface';

@Controller('forms')
export class DesignerController {
  constructor(private readonly designer: DesignerService) {}

  /**
   * Prompt-based refinement of a jsonforms form, streamed over SSE (same
   * transport the Form.io AI-refine uses), so the review UI can show progress.
   */
  @Post(':id/jsonforms/refine')
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
  async refine(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { instruction: string; provider?: string },
    @UploadedFile() image: Express.Multer.File | undefined,
    @Ip() ip: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (type: string, data: unknown) =>
      res.write(`data: ${JSON.stringify({ type, ...(data as object) })}\n\n`);

    try {
      if (!body?.instruction?.trim()) {
        throw new BadRequestException('instruction is required');
      }
      const result = await this.designer.refine(
        user.tenantId,
        id,
        body.instruction,
        body.provider,
        (message) => send('progress', { message }),
        ip,
        user.userId,
        image
          ? {
              buffer: image.buffer,
              // The multer file filter above admits only this MIME-type union.
              mimeType: image.mimetype as ImageContent['mediaType'],
            }
          : undefined,
      );
      send('result', result);
    } catch (err) {
      const message =
        err instanceof BadRequestException
          ? ((err.getResponse() as { message?: string }).message ?? err.message)
          : err instanceof Error
            ? err.message
            : 'An unexpected error occurred';
      send('error', { message });
    }

    res.end();
  }
}
