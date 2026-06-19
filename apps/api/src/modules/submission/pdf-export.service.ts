import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

interface FormComponent {
  type: string;
  key: string;
  label?: string;
  title?: string;
  components?: FormComponent[];
  columns?: Array<{ components: FormComponent[] }>;
  rows?: unknown[][];
  headers?: string[];
  domains?: Array<{
    name: string;
    items: Array<{ field: string; label: string; points: number }>;
  }>;
  thresholds?: Array<{ max: number; label: string }>;
  scoreField?: string;
}

@Injectable()
export class PdfExportService {
  generate(submission: {
    id: string;
    status: string;
    patientMrn?: string | null;
    encounterId?: string | null;
    scores?: Record<string, unknown> | null;
    riskLevel?: string | null;
    data: Record<string, unknown>;
    createdAt: Date;
    form: { name: string };
    formVersion: { version: number; schema: Record<string, unknown> };
    submittedBy: { fullName: string; email: string };
  }): PDFKit.PDFDocument {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    this.renderHeader(doc, submission);
    this.renderPatientInfo(doc, submission);

    if (submission.scores && Object.keys(submission.scores).length > 0) {
      this.renderScores(doc, submission.scores, submission.riskLevel);
    }

    const components =
      (submission.formVersion.schema as { components?: FormComponent[] })
        .components ?? [];
    this.renderComponents(doc, components, submission.data, 0);

    this.renderFooter(doc, submission);

    doc.end();
    return doc;
  }

  private renderHeader(
    doc: PDFKit.PDFDocument,
    submission: { form: { name: string }; formVersion: { version: number } },
  ) {
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(submission.form.name, { align: 'center' });
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Version ${submission.formVersion.version}`, { align: 'center' });
    doc.moveDown(0.5);
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(0.5);
  }

  private renderPatientInfo(
    doc: PDFKit.PDFDocument,
    submission: {
      id: string;
      status: string;
      patientMrn?: string | null;
      encounterId?: string | null;
      createdAt: Date;
      submittedBy: { fullName: string };
    },
  ) {
    doc.fontSize(10).font('Helvetica');
    const info: string[] = [];
    if (submission.patientMrn) info.push(`MRN: ${submission.patientMrn}`);
    if (submission.encounterId)
      info.push(`Encounter: ${submission.encounterId}`);
    info.push(`Status: ${submission.status}`);
    info.push(`Date: ${new Date(submission.createdAt).toLocaleString()}`);
    info.push(`Submitted by: ${submission.submittedBy.fullName}`);

    for (const line of info) {
      doc.text(line);
    }
    doc.moveDown(0.5);
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(0.5);
  }

  private renderScores(
    doc: PDFKit.PDFDocument,
    scores: Record<string, unknown>,
    riskLevel?: string | null,
  ) {
    doc.fontSize(12).font('Helvetica-Bold').text('Scores');
    doc.fontSize(10).font('Helvetica');
    for (const [key, value] of Object.entries(scores)) {
      doc.text(`${key}: ${value}`);
    }
    if (riskLevel) {
      doc.font('Helvetica-Bold').text(`Risk Level: ${riskLevel}`);
      doc.font('Helvetica');
    }
    doc.moveDown(0.5);
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(0.5);
  }

  private renderComponents(
    doc: PDFKit.PDFDocument,
    components: FormComponent[],
    data: Record<string, unknown>,
    depth: number,
  ) {
    for (const comp of components) {
      if (doc.y > 700) {
        doc.addPage();
      }

      switch (comp.type) {
        case 'panel':
          doc
            .fontSize(12 - Math.min(depth, 2))
            .font('Helvetica-Bold')
            .text(comp.title ?? comp.label ?? comp.key);
          doc.moveDown(0.3);
          if (comp.components) {
            this.renderComponents(doc, comp.components, data, depth + 1);
          }
          doc.moveDown(0.3);
          break;

        case 'columns':
          if (comp.columns) {
            for (const col of comp.columns) {
              if (col.components) {
                this.renderComponents(doc, col.components, data, depth);
              }
            }
          }
          break;

        case 'checkbox':
          this.renderField(
            doc,
            comp.label ?? comp.key,
            data[comp.key] ? 'Yes' : 'No',
          );
          break;

        case 'button':
          break;

        case 'scoringMatrix':
        case 'colorCodedGrid':
        case 'riskStratification':
        case 'clinicalReferenceTable':
        case 'signatureDate':
          this.renderField(
            doc,
            comp.label ?? comp.key,
            this.formatValue(data[comp.key]),
          );
          break;

        default:
          if (comp.components) {
            this.renderComponents(doc, comp.components, data, depth);
          } else {
            const value = data[comp.key];
            if (value !== undefined && value !== null && value !== '') {
              this.renderField(
                doc,
                comp.label ?? comp.key,
                this.formatValue(value),
              );
            }
          }
          break;
      }
    }
  }

  private renderField(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
  ) {
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text(`${label}: `, { continued: true })
      .font('Helvetica')
      .text(value);
  }

  private renderFooter(
    doc: PDFKit.PDFDocument,
    submission: { id: string },
  ) {
    doc.moveDown(1);
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(0.3);
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#888')
      .text(`Submission ID: ${submission.id}`, { align: 'center' })
      .text('Generated by OpenMedForm', { align: 'center' });
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
