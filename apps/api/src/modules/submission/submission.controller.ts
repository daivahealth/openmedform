import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SubmissionService } from './submission.service';
import { PdfExportService } from './pdf-export.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/jwt-payload.interface';

@Controller()
export class SubmissionController {
  constructor(
    private readonly submissionService: SubmissionService,
    private readonly pdfExportService: PdfExportService,
  ) {}

  @Post('forms/:formId/submissions')
  create(
    @CurrentUser() user: RequestUser,
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: CreateSubmissionDto,
  ) {
    return this.submissionService.create(
      user.tenantId,
      user.userId,
      formId,
      dto,
    );
  }

  @Get('submissions')
  findAll(@CurrentUser() user: RequestUser) {
    return this.submissionService.findAll(user.tenantId);
  }

  @Get('submissions/count')
  async count(@CurrentUser() user: RequestUser) {
    return { count: await this.submissionService.count(user.tenantId) };
  }

  @Get('forms/:formId/submissions')
  findAllByForm(
    @CurrentUser() user: RequestUser,
    @Param('formId', ParseUUIDPipe) formId: string,
  ) {
    return this.submissionService.findAllByForm(user.tenantId, formId);
  }

  @Get('submissions/:id')
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.submissionService.findOne(user.tenantId, id);
  }

  @Put('submissions/:id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubmissionDto,
  ) {
    return this.submissionService.updateData(user.tenantId, id, dto.data);
  }

  @Post('submissions/:id/complete')
  complete(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ) {
    return this.submissionService.complete(user.tenantId, id, {
      userId: user.userId,
      displayName: user.email,
      ipAddress: ip,
    });
  }

  @Post('submissions/:id/sign')
  sign(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ) {
    return this.submissionService.sign(user.tenantId, id, {
      userId: user.userId,
      displayName: user.email,
      ipAddress: ip,
    });
  }

  @Get('submissions/:id/pdf')
  async exportPdf(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const submission = await this.submissionService.findOne(user.tenantId, id);
    const doc = this.pdfExportService.generate(submission as any);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="submission-${id}.pdf"`,
    );
    doc.pipe(res);
  }
}
