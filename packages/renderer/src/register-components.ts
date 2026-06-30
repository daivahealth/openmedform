let registered = false;

export function registerClinicalComponents(Formio: any) {
  if (registered) return;
  registered = true;

  registerScoringMatrix(Formio);
  registerColorCodedGrid(Formio);
  registerRiskStratification(Formio);
  registerSignatureDate(Formio);
  registerClinicalReferenceTable(Formio);
  registerVitalSignsChart(Formio);
}

function registerScoringMatrix(Formio: any) {
  const Components = Formio.Components;
  const BaseComponent = Components?.components?.htmlelement;
  if (!BaseComponent) return;

  class ScoringMatrixComponent extends BaseComponent {
    static schema(...extend: any[]) {
      return BaseComponent.schema(
        {
          type: 'scoringMatrix',
          label: 'Scoring Matrix',
          key: 'scoringMatrix',
          input: true,
          domains: [],
          tableView: false,
        },
        ...extend,
      );
    }

    static get builderInfo() {
      return {
        title: 'Scoring Matrix',
        group: 'clinical',
        icon: 'th',
        weight: 10,
        schema: ScoringMatrixComponent.schema(),
      };
    }

    get defaultSchema() {
      return ScoringMatrixComponent.schema();
    }

    render() {
      const domains = this.component.domains || [];
      let total = 0;
      let html = '<table class="table table-bordered table-sm"><thead><tr><th>Risk Factor</th><th>Points</th><th>Present</th></tr></thead><tbody>';

      for (const domain of domains) {
        html += `<tr class="table-secondary"><td colspan="3"><strong>${domain.name || 'Domain'}</strong></td></tr>`;
        for (const item of domain.items || []) {
          const checked = this.dataValue?.[item.field] ? 'checked' : '';
          if (checked) total += item.points || 0;
          html += `<tr><td>${item.label || item.field}</td><td>${item.points || 0}</td><td><input type="checkbox" data-field="${item.field}" ${checked} /></td></tr>`;
        }
      }

      html += `</tbody><tfoot><tr><td colspan="2"><strong>Total Score</strong></td><td><strong>${total}</strong></td></tr></tfoot></table>`;

      return super.render(html);
    }

    attach(element: any) {
      const result = super.attach(element);
      const checkboxes = element.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((cb: HTMLInputElement) => {
        cb.addEventListener('change', () => {
          const field = cb.getAttribute('data-field');
          if (field) {
            const current = this.dataValue || {};
            current[field] = cb.checked;
            this.dataValue = current;
            this.triggerChange();
            this.redraw();
          }
        });
      });
      return result;
    }
  }

  Components.addComponent('scoringMatrix', ScoringMatrixComponent);
}

function registerColorCodedGrid(Formio: any) {
  const Components = Formio.Components;
  const BaseComponent = Components?.components?.htmlelement;
  if (!BaseComponent) return;

  class ColorCodedGridComponent extends BaseComponent {
    static schema(...extend: any[]) {
      return BaseComponent.schema(
        {
          type: 'colorCodedGrid',
          label: 'Color Coded Grid',
          key: 'colorCodedGrid',
          input: false,
          rows: [],
          scoreField: '',
          tableView: false,
        },
        ...extend,
      );
    }

    static get builderInfo() {
      return {
        title: 'Color Coded Grid',
        group: 'clinical',
        icon: 'table',
        weight: 20,
        schema: ColorCodedGridComponent.schema(),
      };
    }

    get defaultSchema() {
      return ColorCodedGridComponent.schema();
    }

    render() {
      const rows = this.component.rows || [];
      let html = '<table class="table table-bordered table-sm"><tbody>';

      for (const row of rows) {
        const bg = row.color || '#ffffff';
        html += `<tr style="background-color: ${bg}"><td>${row.label || ''}</td><td>${row.range || ''}</td></tr>`;
      }

      html += '</tbody></table>';
      return super.render(html);
    }
  }

  Components.addComponent('colorCodedGrid', ColorCodedGridComponent);
}

function registerRiskStratification(Formio: any) {
  const Components = Formio.Components;
  const BaseComponent = Components?.components?.htmlelement;
  if (!BaseComponent) return;

  class RiskStratificationComponent extends BaseComponent {
    static schema(...extend: any[]) {
      return BaseComponent.schema(
        {
          type: 'riskStratification',
          label: 'Risk Level',
          key: 'riskStratification',
          input: false,
          scoreField: '',
          thresholds: [],
          tableView: false,
        },
        ...extend,
      );
    }

    static get builderInfo() {
      return {
        title: 'Risk Stratification',
        group: 'clinical',
        icon: 'exclamation-triangle',
        weight: 30,
        schema: RiskStratificationComponent.schema(),
      };
    }

    get defaultSchema() {
      return RiskStratificationComponent.schema();
    }

    render() {
      const html = '<div class="alert alert-info">Risk level will be calculated on submission</div>';
      return super.render(html);
    }
  }

  Components.addComponent('riskStratification', RiskStratificationComponent);
}

function registerSignatureDate(Formio: any) {
  const Components = Formio.Components;
  const BaseComponent = Components?.components?.htmlelement;
  if (!BaseComponent) return;

  class SignatureDateComponent extends BaseComponent {
    static schema(...extend: any[]) {
      return BaseComponent.schema(
        {
          type: 'signatureDate',
          label: 'Signature & Date',
          key: 'signatureDate',
          input: true,
          tableView: false,
        },
        ...extend,
      );
    }

    static get builderInfo() {
      return {
        title: 'Signature & Date',
        group: 'clinical',
        icon: 'pencil',
        weight: 40,
        schema: SignatureDateComponent.schema(),
      };
    }

    get defaultSchema() {
      return SignatureDateComponent.schema();
    }

    render() {
      const current = this.dataValue || {};
      const html = `
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Printed Name</label>
            <input type="text" class="form-control" data-sig-field="printedName" value="${current.printedName || ''}" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Date</label>
            <input type="date" class="form-control" data-sig-field="date" value="${current.date || ''}" />
          </div>
        </div>`;
      return super.render(html);
    }

    attach(element: any) {
      const result = super.attach(element);
      const inputs = element.querySelectorAll('[data-sig-field]');
      inputs.forEach((input: HTMLInputElement) => {
        input.addEventListener('change', () => {
          const field = input.getAttribute('data-sig-field');
          if (field) {
            const current = this.dataValue || {};
            current[field] = input.value;
            this.dataValue = current;
            this.triggerChange();
          }
        });
      });
      return result;
    }
  }

  Components.addComponent('signatureDate', SignatureDateComponent);
}

function registerClinicalReferenceTable(Formio: any) {
  const Components = Formio.Components;
  const BaseComponent = Components?.components?.htmlelement;
  if (!BaseComponent) return;

  class ClinicalReferenceTableComponent extends BaseComponent {
    static schema(...extend: any[]) {
      return BaseComponent.schema(
        {
          type: 'clinicalReferenceTable',
          label: 'Clinical Reference Table',
          key: 'clinicalReferenceTable',
          input: false,
          headers: [],
          rows: [],
          tableView: false,
        },
        ...extend,
      );
    }

    static get builderInfo() {
      return {
        title: 'Reference Table',
        group: 'clinical',
        icon: 'book',
        weight: 50,
        schema: ClinicalReferenceTableComponent.schema(),
      };
    }

    get defaultSchema() {
      return ClinicalReferenceTableComponent.schema();
    }

    render() {
      const headers = this.component.headers || [];
      const rows = this.component.rows || [];

      let html = '<table class="table table-bordered table-sm"><thead><tr>';
      for (const h of headers) {
        html += `<th>${h}</th>`;
      }
      html += '</tr></thead><tbody>';
      for (const row of rows) {
        html += '<tr>';
        for (const cell of row) {
          html += `<td>${cell}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      return super.render(html);
    }
  }

  Components.addComponent('clinicalReferenceTable', ClinicalReferenceTableComponent);
}

function registerVitalSignsChart(Formio: any) {
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
          columns: [],
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

    render() {
      const columns = this.component.columns || [];
      const rows = Array.isArray(this.dataValue) ? this.dataValue : [];

      let html = '<div style="overflow-x:auto"><table class="table table-bordered table-sm" style="min-width:1000px">';
      html += '<thead><tr>';
      for (const column of columns) {
        html += `<th>${column.label || column.key}</th>`;
      }
      html += '</tr></thead><tbody>';

      for (const row of rows) {
        html += '<tr>';
        for (const column of columns) {
          html += `<td>${row?.[column.key] ?? ''}</td>`;
        }
        html += '</tr>';
      }

      html += '</tbody></table></div>';
      return super.render(html);
    }
  }

  Components.addComponent('vitalSignsChart', VitalSignsChartComponent);
}
