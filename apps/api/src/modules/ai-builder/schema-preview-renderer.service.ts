import { Injectable } from '@nestjs/common';
import { createCanvas, CanvasRenderingContext2D } from '@napi-rs/canvas';

type FormComponent = Record<string, unknown>;

@Injectable()
export class SchemaPreviewRendererService {
  renderToPngBase64(schema: Record<string, unknown>): string {
    const width = 1400;
    const components = Array.isArray(schema.components)
      ? (schema.components as FormComponent[])
      : [];
    const height = Math.max(900, 160 + this.estimateHeight(components));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 28px Arial';
    ctx.fillText('Generated OpenMedForm Preview', 40, 50);

    let y = 90;
    for (const component of components) {
      y = this.drawComponent(ctx, component, 40, y, width - 80, 0);
      y += 16;
    }

    return canvas.toBuffer('image/png').toString('base64');
  }

  private estimateHeight(components: FormComponent[]): number {
    let total = 0;
    for (const component of components) {
      const type = component.type as string;
      if (type === 'vitalSignsChart') total += 430;
      else if (type === 'clinicalReferenceTable') total += 260;
      else if (type === 'panel') {
        total += 80 + this.estimateHeight(
          Array.isArray(component.components)
            ? (component.components as FormComponent[])
            : [],
        );
      } else total += 72;
    }
    return total;
  }

  private drawComponent(
    ctx: CanvasRenderingContext2D,
    component: FormComponent,
    x: number,
    y: number,
    width: number,
    depth: number,
  ): number {
    const type = component.type as string;

    if (type === 'panel') {
      return this.drawPanel(ctx, component, x, y, width, depth);
    }
    if (type === 'vitalSignsChart') {
      return this.drawVitalSignsChart(ctx, component, x, y, width);
    }
    if (type === 'clinicalReferenceTable') {
      return this.drawClinicalReferenceTable(ctx, component, x, y, width);
    }
    if (type === 'htmlelement') {
      return this.drawTextBlock(
        ctx,
        this.stripHtml(String(component.content ?? component.label ?? 'Text')),
        x,
        y,
        width,
      );
    }
    if (type === 'button') {
      return this.drawButton(ctx, String(component.label ?? 'Submit'), x, y);
    }

    return this.drawField(ctx, component, x, y, width);
  }

  private drawPanel(
    ctx: CanvasRenderingContext2D,
    component: FormComponent,
    x: number,
    y: number,
    width: number,
    depth: number,
  ): number {
    const title = String(component.title ?? component.label ?? 'Panel');
    const startY = y;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.fillStyle = depth === 0 ? '#f8fafc' : '#ffffff';
    ctx.fillRect(x, y, width, 54);
    ctx.strokeRect(x, y, width, 54);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(title, x + 16, y + 35);
    y += 76;

    const children = Array.isArray(component.components)
      ? (component.components as FormComponent[])
      : [];
    for (const child of children) {
      y = this.drawComponent(ctx, child, x + 18, y, width - 36, depth + 1);
      y += 12;
    }

    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(x, startY, width, y - startY + 8);
    return y + 12;
  }

  private drawVitalSignsChart(
    ctx: CanvasRenderingContext2D,
    component: FormComponent,
    x: number,
    y: number,
    width: number,
  ): number {
    const columns = Array.isArray(component.columns)
      ? (component.columns as Array<{ label?: string; key?: string }>)
      : [];
    const labels = columns.length
      ? columns.map((column) => column.label ?? column.key ?? '')
      : ['Date', 'Time', 'BP', 'Pulse', 'RR', 'Temp', 'SpO2', 'O2', 'AVPU', 'Pain', 'Glucose', 'EWS', 'Staff'];
    const visibleRows = Math.min(Number(component.rows ?? 8), 12);
    const rowHeight = 38;
    const headerHeight = 78;
    const colWidth = width / labels.length;

    ctx.fillStyle = '#eff6ff';
    ctx.fillRect(x, y, width, 44);
    ctx.strokeStyle = '#bfdbfe';
    ctx.strokeRect(x, y, width, 44);
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(String(component.label ?? 'Vital Signs Chart'), x + 12, y + 28);
    y += 54;

    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(x, y, width, headerHeight);
    ctx.strokeStyle = '#94a3b8';
    ctx.strokeRect(x, y, width, headerHeight + visibleRows * rowHeight);

    ctx.font = 'bold 11px Arial';
    ctx.fillStyle = '#111827';
    labels.forEach((label, index) => {
      const cx = x + index * colWidth;
      ctx.strokeRect(cx, y, colWidth, headerHeight);
      this.wrapText(ctx, String(label), cx + 4, y + 18, colWidth - 8, 13, 4);
    });

    y += headerHeight;
    ctx.font = '12px Arial';
    for (let row = 0; row < visibleRows; row++) {
      labels.forEach((_label, index) => {
        const cx = x + index * colWidth;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx, y + row * rowHeight, colWidth, rowHeight);
        ctx.strokeStyle = '#cbd5e1';
        ctx.strokeRect(cx, y + row * rowHeight, colWidth, rowHeight);
      });
    }

    return y + visibleRows * rowHeight + 10;
  }

  private drawClinicalReferenceTable(
    ctx: CanvasRenderingContext2D,
    component: FormComponent,
    x: number,
    y: number,
    width: number,
  ): number {
    const title = String(component.title ?? component.label ?? 'Reference Table');
    const headers = Array.isArray(component.headers)
      ? (component.headers as string[])
      : [];
    const rows = Array.isArray(component.rows)
      ? (component.rows as unknown[][])
      : [];
    const colCount = Math.max(headers.length, rows[0]?.length ?? 1);
    const colWidth = width / colCount;
    const rowHeight = 34;

    ctx.fillStyle = '#ecfdf5';
    ctx.fillRect(x, y, width, 42);
    ctx.strokeStyle = '#bbf7d0';
    ctx.strokeRect(x, y, width, 42);
    ctx.fillStyle = '#14532d';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(title, x + 12, y + 27);
    y += 52;

    ctx.font = 'bold 11px Arial';
    headers.forEach((header, index) => {
      const cx = x + index * colWidth;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(cx, y, colWidth, rowHeight);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(cx, y, colWidth, rowHeight);
      this.wrapText(ctx, String(header), cx + 4, y + 14, colWidth - 8, 12, 2);
    });
    y += rowHeight;

    ctx.font = '11px Arial';
    for (const row of rows.slice(0, 8)) {
      for (let index = 0; index < colCount; index++) {
        const cx = x + index * colWidth;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx, y, colWidth, rowHeight);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(cx, y, colWidth, rowHeight);
        this.wrapText(ctx, String(row[index] ?? ''), cx + 4, y + 14, colWidth - 8, 12, 2);
      }
      y += rowHeight;
    }

    return y + 10;
  }

  private drawField(
    ctx: CanvasRenderingContext2D,
    component: FormComponent,
    x: number,
    y: number,
    width: number,
  ): number {
    const label = String(component.label ?? component.key ?? component.type ?? 'Field');
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(x, y, width, 48);
    ctx.fillStyle = '#334155';
    ctx.font = '14px Arial';
    ctx.fillText(label, x + 12, y + 30);
    return y + 50;
  }

  private drawTextBlock(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    width: number,
  ): number {
    ctx.fillStyle = '#475569';
    ctx.font = '14px Arial';
    return this.wrapText(ctx, text, x, y + 18, width, 18, 4) + 10;
  }

  private drawButton(
    ctx: CanvasRenderingContext2D,
    label: string,
    x: number,
    y: number,
  ): number {
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(x, y, 140, 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(label, x + 36, y + 27);
    return y + 46;
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number,
  ): number {
    const words = text.split(/\s+/);
    let line = '';
    let lines = 0;

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        lines++;
        line = word;
        if (lines >= maxLines) return y;
      } else {
        line = testLine;
      }
    }

    if (line && lines < maxLines) {
      ctx.fillText(line, x, y);
      y += lineHeight;
    }
    return y;
  }

  private stripHtml(value: string): string {
    return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
