import {
  BadRequestException,
  Body,
  Controller,
  Logger,
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
import { Throttle } from '@nestjs/throttler';
import { AI_THROTTLE } from '../../common/throttle.config';

@Controller('forms')
export class DesignerController {
  private readonly logger = new Logger(DesignerController.name);

  constructor(private readonly designer: DesignerService) {}

  /**
   * Prompt-based refinement of a jsonforms form, streamed over SSE (same
   * transport the Form.io AI-refine uses), so the review UI can show progress.
   */
  @Throttle(AI_THROTTLE)
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
      // Only BadRequestException messages are written FOR the user — everything
      // else is an internal failure whose message is not fit to send.
      //
      // A Prisma validation error, for instance, pretty-prints the entire
      // failing query: 114 KB of the form's own schema, absolute server paths
      // and source line numbers, all of which used to be streamed straight into
      // the browser. Unreadable as an error, and it leaks server internals.
      if (err instanceof BadRequestException) {
        const response = err.getResponse() as { message?: string };
        send('error', { message: response.message ?? err.message });
      } else {
        this.logger.error(
          `Refine failed for form ${id}: ${err instanceof Error ? err.stack : String(err)}`,
        );
        send('error', {
          message:
            'Refinement failed because of a problem on the server. Nothing was changed. ' +
            'Please try again, and report this if it keeps happening.',
        });
      }
    }

    res.end();
  }
}
