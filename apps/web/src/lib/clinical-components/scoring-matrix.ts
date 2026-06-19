export function registerScoringMatrix(Formio: any) {
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
          domains: [
            {
              name: 'General',
              items: [
                { field: 'item1', label: 'Risk Factor 1', points: 1 },
              ],
            },
          ],
          tableView: false,
        },
        ...extend,
      );
    }

    static get builderInfo() {
      return {
        title: 'Scoring Matrix',
        group: 'clinical',
        icon: 'table',
        weight: 10,
        schema: ScoringMatrixComponent.schema(),
      };
    }

    get defaultSchema() {
      return ScoringMatrixComponent.schema();
    }

    get domains() {
      return this.component.domains || [];
    }

    get totalScore(): number {
      let total = 0;
      for (const domain of this.domains) {
        for (const item of domain.items || []) {
          const val = this.root?.data?.[item.field];
          if (val === true || val === 1 || val === '1') {
            total += item.points || 0;
          }
        }
      }
      return total;
    }

    renderContent() {
      let html = '<div class="scoring-matrix">';
      html += '<table class="table table-bordered table-sm" style="width:100%">';
      html += '<thead><tr>';
      html += '<th style="width:50%">Risk Factor</th>';
      html += '<th style="width:15%;text-align:center">Points</th>';
      html += '<th style="width:15%;text-align:center">Score</th>';
      html += '</tr></thead><tbody>';

      for (const domain of this.domains) {
        html += `<tr style="background:#f0f4f8"><td colspan="3"><strong>${this.t(domain.name)}</strong></td></tr>`;
        for (const item of domain.items || []) {
          const checked = this.root?.data?.[item.field];
          const isChecked = checked === true || checked === 1;
          const score = isChecked ? item.points : 0;
          html += '<tr>';
          html += `<td>${this.t(item.label)}</td>`;
          html += `<td style="text-align:center">${item.points}</td>`;
          html += `<td style="text-align:center;font-weight:bold">${score}</td>`;
          html += '</tr>';
        }
      }

      html += `<tr style="background:#e2e8f0;font-weight:bold">`;
      html += `<td colspan="2">Total Score</td>`;
      html += `<td style="text-align:center;font-size:1.2em">${this.totalScore}</td>`;
      html += '</tr>';
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

  Components.addComponent('scoringMatrix', ScoringMatrixComponent);
}
