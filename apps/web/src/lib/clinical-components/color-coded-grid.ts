export function registerColorCodedGrid(Formio: any) {
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
          scoreField: '',
          rows: [
            {
              label: 'Low Risk',
              range: '0-1',
              max: 1,
              color: '#d4edda',
              textColor: '#155724',
              action: 'No prophylaxis needed',
            },
            {
              label: 'Medium Risk',
              range: '2-3',
              max: 3,
              color: '#fff3cd',
              textColor: '#856404',
              action: 'Consider prophylaxis',
            },
            {
              label: 'High Risk',
              range: '4+',
              max: 999,
              color: '#f8d7da',
              textColor: '#721c24',
              action: 'Prophylaxis recommended',
            },
          ],
          tableView: false,
        },
        ...extend,
      );
    }

    static get builderInfo() {
      return {
        title: 'Color Coded Grid',
        group: 'clinical',
        icon: 'th',
        weight: 20,
        schema: ColorCodedGridComponent.schema(),
      };
    }

    get defaultSchema() {
      return ColorCodedGridComponent.schema();
    }

    get scoreValue(): number | null {
      const field = this.component.scoreField;
      if (!field) return null;
      const val = this.root?.data?.[field];
      return typeof val === 'number' ? val : null;
    }

    get activeRowIndex(): number {
      const score = this.scoreValue;
      if (score === null) return -1;
      const rows = this.component.rows || [];
      const sorted = [...rows].sort(
        (a: any, b: any) => (a.max ?? 0) - (b.max ?? 0),
      );
      for (let i = 0; i < sorted.length; i++) {
        if (score <= sorted[i].max) return i;
      }
      return sorted.length - 1;
    }

    renderContent() {
      const rows = this.component.rows || [];
      const activeIdx = this.activeRowIndex;
      const score = this.scoreValue;

      let html = '<div class="color-coded-grid">';
      if (score !== null) {
        html += `<div style="margin-bottom:8px;font-weight:bold">Current Score: ${score}</div>`;
      }
      html += '<table class="table table-bordered" style="width:100%">';
      html += '<thead><tr>';
      html += '<th>Risk Level</th><th>Score Range</th><th>Recommended Action</th>';
      html += '</tr></thead><tbody>';

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const isActive = i === activeIdx;
        const bg = row.color || '#fff';
        const fg = row.textColor || '#000';
        const border = isActive ? '3px solid ' + fg : 'none';
        const fontWeight = isActive ? 'bold' : 'normal';

        html += `<tr style="background:${bg};color:${fg};border:${border};font-weight:${fontWeight}">`;
        html += `<td>${isActive ? '&#9654; ' : ''}${this.t(row.label)}</td>`;
        html += `<td style="text-align:center">${row.range}</td>`;
        html += `<td>${this.t(row.action || '')}</td>`;
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
      return super.attach(element);
    }
  }

  Components.addComponent('colorCodedGrid', ColorCodedGridComponent);
}
