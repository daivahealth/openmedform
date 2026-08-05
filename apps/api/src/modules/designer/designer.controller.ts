import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
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
        const message = response.message ?? err.message;
        send('error', { message });
        await this.designer.recordFailure(user.tenantId, id, message, user.userId);
      } else {
        this.logger.error(
          `Refine failed for form ${id}: ${err instanceof Error ? err.stack : String(err)}`,
        );
        const message =
          'Refinement failed because of a problem on the server. Nothing was changed. ' +
          'Please try again, and report this if it keeps happening.';
        send('error', { message });
        await this.designer.recordFailure(user.tenantId, id, message, user.userId);
      }
    }

    res.end();
  }

  /**
   * The dictionary panel's write path: set/replace/clear the terminology
   * bindings of one field or one answer option. Validation is deliberate and
   * boring — this is clinical metadata written by a click.
   */
  @Patch(':id/coding')
  async updateCoding(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      scope?: string;
      optionCode?: string;
      coding?: Array<{
        system?: string;
        code?: string;
        display?: string;
        source?: string;
        confidence?: number;
        verified?: boolean;
      }>;
    },
    @Ip() ip: string,
  ) {
    if (!body?.scope || typeof body.scope !== 'string') {
      throw new BadRequestException('scope is required');
    }
    if (!Array.isArray(body.coding)) {
      throw new BadRequestException('coding must be an array (empty clears the binding)');
    }
    if (body.coding.length > 10) {
      throw new BadRequestException('a field carries at most 10 bindings');
    }
    const coding = body.coding.map((c, i) => {
      if (!c?.system || typeof c.system !== 'string' || !c.code || typeof c.code !== 'string') {
        throw new BadRequestException(`coding[${i}] needs a string system and code`);
      }
      if (c.system.length > 200 || c.code.length > 100 || (c.display ?? '').length > 500) {
        throw new BadRequestException(`coding[${i}] has an over-long value`);
      }
      if (c.source !== 'ai' && c.source !== 'human') {
        throw new BadRequestException(`coding[${i}].source must be 'ai' or 'human'`);
      }
      return {
        system: c.system,
        code: c.code,
        ...(c.display ? { display: c.display } : {}),
        source: c.source as 'ai' | 'human',
        ...(typeof c.confidence === 'number' ? { confidence: c.confidence } : {}),
        verified: c.verified === true,
      };
    });

    return this.designer.updateCoding(
      user.tenantId,
      id,
      { scope: body.scope, optionCode: body.optionCode, coding },
      ip,
      user.userId,
    );
  }

  /**
   * The refine conversation for a form — the chat panel's history. Read-only;
   * rows are written by the refine flow itself, so the transcript can only
   * ever say what actually happened.
   */
  @Get(':id/ai/messages')
  listMessages(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.designer.listMessages(user.tenantId, id);
  }
}
