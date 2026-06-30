type VitalSignsColumn = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'select';
  options?: Array<{ label: string; value: string }>;
};

const DEFAULT_COLUMNS: VitalSignsColumn[] = [
  { key: 'observationDate', label: 'Date' },
  { key: 'observationTime', label: 'Time (24 HR)' },
  { key: 'bloodPressure', label: 'Blood Pressure Systolic / Diastolic (mmHg)' },
  { key: 'heartRate', label: 'Pulse / Heart Rate (bpm)', type: 'number' },
  { key: 'respiratoryRate', label: 'Respiratory Rate (cpm)', type: 'number' },
  { key: 'temperatureCelsius', label: 'Temperature (°C)', type: 'number' },
  { key: 'oxygenSaturation', label: 'Oxygen Saturation SpO₂ (%)', type: 'number' },
  { key: 'supplementalOxygen', label: 'Supplemental O₂ L/min or Room Air' },
  {
    key: 'consciousnessAvpu',
    label: 'Consciousness AVPU',
    type: 'select',
    options: [
      { label: 'Alert', value: 'alert' },
      { label: 'Voice', value: 'voice' },
      { label: 'Pain', value: 'pain' },
      { label: 'Unresponsive', value: 'unresponsive' },
    ],
  },
  { key: 'painScore', label: 'Pain Score (0-10)', type: 'number' },
  { key: 'bloodGlucose', label: 'Blood Glucose', type: 'number' },
  { key: 'ewsNewsTotalScore', label: 'EWS / NEWS Total Score', type: 'number' },
  { key: 'staffInitials', label: 'Staff Initials / Sign' },
];

export function registerVitalSignsChart(Formio: any) {
  const Components = Formio.Components;
  const BaseComponent = Components?.components?.htmlelement;
  if (!BaseComponent) return;

  class VitalSignsChartComponent extends BaseComponent {
    static schema(...extend: any[]) {
      return BaseComponent.schema(
        {
          type: 'vitalSignsChart',
          label: 'Vital Signs Chart',
          key: 'vitalSignsChart',
          input: true,
          rows: 8,
          columns: DEFAULT_COLUMNS,
          tableView: false,
        },
        ...extend,
      );
    }

    static get builderInfo() {
      return {
        title: 'Vital Signs Chart',
        group: 'clinical',
        icon: 'heartbeat',
        weight: 5,
        schema: VitalSignsChartComponent.schema(),
      };
    }

    get defaultSchema() {
      return VitalSignsChartComponent.schema();
    }

    get columns(): VitalSignsColumn[] {
      return Array.isArray(this.component.columns) && this.component.columns.length
        ? this.component.columns
        : DEFAULT_COLUMNS;
    }

    get rowCount(): number {
      const rows = Number(this.component.rows);
      return Number.isFinite(rows) && rows > 0 ? rows : 8;
    }

    get rowsValue(): Array<Record<string, unknown>> {
      return Array.isArray(this.dataValue) ? this.dataValue : [];
    }

    renderContent() {
      const readOnly = this.options?.readOnly;
      const rows = this.rowsValue;

      let html = '<div class="vital-signs-chart" style="overflow-x:auto">';
      html += '<table class="table table-bordered table-sm" style="min-width:1200px;font-size:12px">';
      html += '<thead><tr style="background:#f8f9fa">';
      for (const column of this.columns) {
        html += `<th style="vertical-align:middle;min-width:110px">${this.escapeHtml(this.t(column.label))}</th>`;
      }
      html += '</tr></thead><tbody>';

      for (let rowIndex = 0; rowIndex < this.rowCount; rowIndex++) {
        const row = rows[rowIndex] ?? {};
        html += '<tr>';
        for (const column of this.columns) {
          const value = String(row[column.key] ?? '');
          html += '<td style="padding:4px">';
          if (readOnly) {
            html += this.escapeHtml(value);
          } else if (column.type === 'select') {
            html += `<select class="form-select form-select-sm" data-vsc-row="${rowIndex}" data-vsc-field="${this.escapeHtml(column.key)}">`;
            html += '<option value=""></option>';
            for (const option of column.options ?? []) {
              const selected = option.value === value ? ' selected' : '';
              html += `<option value="${this.escapeHtml(option.value)}"${selected}>${this.escapeHtml(option.label)}</option>`;
            }
            html += '</select>';
          } else {
            const inputType = column.type === 'number' ? 'number' : 'text';
            html += `<input class="form-control form-control-sm" type="${inputType}" value="${this.escapeHtml(value)}" data-vsc-row="${rowIndex}" data-vsc-field="${this.escapeHtml(column.key)}" />`;
          }
          html += '</td>';
        }
        html += '</tr>';
      }

      html += '</tbody></table></div>';
      return html;
    }

    render() {
      return super.render(this.renderContent());
    }

    attach(element: HTMLElement) {
      this.loadRefs(element, {});
      const controls = element.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        '[data-vsc-row][data-vsc-field]',
      );

      controls.forEach((control) => {
        control.addEventListener('change', () => this.updateRowsFromElement(element));
        control.addEventListener('input', () => this.updateRowsFromElement(element));
      });

      return super.attach(element);
    }

    updateRowsFromElement(element: HTMLElement) {
      const rows: Array<Record<string, unknown>> = [];
      const controls = element.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        '[data-vsc-row][data-vsc-field]',
      );

      controls.forEach((control) => {
        const rowIndex = Number(control.dataset.vscRow);
        const field = control.dataset.vscField;
        if (!Number.isFinite(rowIndex) || !field) return;

        rows[rowIndex] ??= {};
        rows[rowIndex][field] =
          control.type === 'number' && control.value !== ''
            ? Number(control.value)
            : control.value;
      });

      this.updateValue(rows);
    }

    escapeHtml(value: string): string {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  }

  Components.addComponent('vitalSignsChart', VitalSignsChartComponent);
}
