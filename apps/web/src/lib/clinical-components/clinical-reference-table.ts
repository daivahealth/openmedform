export function registerClinicalReferenceTable(Formio: any) {
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
          title: 'Reference Guide',
          headers: ['Category', 'Details', 'Dosing'],
          rows: [
            ['Example Category', 'Description here', 'Dose info'],
          ],
          footnote: '',
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

    renderContent() {
      const headers = this.component.headers || [];
      const rows = this.component.rows || [];
      const title = this.component.title || '';
      const footnote = this.component.footnote || '';

      let html = '<div class="clinical-reference-table">';

      if (title) {
        html += `<div style="font-weight:bold;font-size:14px;margin-bottom:8px;padding:8px;background:#e8f4fd;border-radius:4px">${this.t(title)}</div>`;
      }

      html += '<table class="table table-bordered table-sm" style="width:100%;font-size:13px">';

      if (headers.length > 0) {
        html += '<thead><tr style="background:#f8f9fa">';
        for (const header of headers) {
          html += `<th style="padding:6px 8px">${this.t(header)}</th>`;
        }
        html += '</tr></thead>';
      }

      html += '<tbody>';
      for (const row of rows) {
        html += '<tr>';
        const cells = Array.isArray(row) ? row : [row];
        for (const cell of cells) {
          html += `<td style="padding:6px 8px">${this.t(String(cell))}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';

      if (footnote) {
        html += `<div style="font-size:11px;color:#6c757d;font-style:italic;margin-top:4px">${this.t(footnote)}</div>`;
      }

      html += '</div>';
      return html;
    }

    render() {
      return super.render(this.renderContent());
    }

    attach(element: HTMLElement) {
      this.loadRefs(element, {});
      return super.attach(element);
    }
  }

  Components.addComponent(
    'clinicalReferenceTable',
    ClinicalReferenceTableComponent,
  );
}
