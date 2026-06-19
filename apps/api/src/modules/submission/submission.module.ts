import { Module } from '@nestjs/common';
import { SubmissionController } from './submission.controller';
import { SubmissionService } from './submission.service';
import { PdfExportService } from './pdf-export.service';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [ScoringModule],
  controllers: [SubmissionController],
  providers: [SubmissionService, PdfExportService],
  exports: [SubmissionService],
})
export class SubmissionModule {}
