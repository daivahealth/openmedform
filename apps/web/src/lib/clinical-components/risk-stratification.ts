export function registerRiskStratification(Formio: any) {
  const Components = Formio.Components;
  const BaseComponent = Components?.components?.htmlelement;
  if (!BaseComponent) return;

  class RiskStratificationComponent extends BaseComponent {
    static schema(...extend: any[]) {
      return BaseComponent.schema(
        {
          type: 'riskStratification',
          label: 'Risk Stratification',
          key: 'riskStratification',
          input: false,
          scoreField: '',
          thresholds: [
            { max: 1, label: 'Low Risk', color: '#28a745' },
            { max: 3, label: 'Medium Risk', color: '#ffc107' },
            { max: 999, label: 'High Risk', color: '#dc3545' },
          ],
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

    get scoreValue(): number | null {
      const field = this.component.scoreField;
      if (!field) return null;
      const val = this.root?.data?.[field];
      return typeof val === 'number' ? val : null;
    }

    get riskLevel(): { label: string; color: string } | null {
      const score = this.scoreValue;
      if (score === null) return null;
      const thresholds = [...(this.component.thresholds || [])].sort(
        (a: any, b: any) => a.max - b.max,
      );
      for (const t of thresholds) {
        if (score <= t.max) return { label: t.label, color: t.color };
      }
      if (thresholds.length > 0) {
        const last = thresholds[thresholds.length - 1];
        return { label: last.label, color: last.color };
      }
      return null;
    }

    renderContent() {
      const score = this.scoreValue;
      const risk = this.riskLevel;

      if (score === null || !risk) {
        return `<div style="padding:16px;text-align:center;color:#6c757d;border:2px dashed #dee2e6;border-radius:8px">
          <div style="font-size:14px">Risk level will appear once scoring data is available</div>
        </div>`;
      }

      const textColor =
        this.getContrastColor(risk.color) === 'dark' ? '#000' : '#fff';

      return `<div style="padding:20px;text-align:center;background:${risk.color};color:${textColor};border-radius:8px;margin:8px 0">
        <div style="font-size:28px;font-weight:bold;letter-spacing:2px">${risk.label.toUpperCase()}</div>
        <div style="font-size:16px;margin-top:4px">Score: ${score}</div>
      </div>`;
    }

    getContrastColor(hex: string): 'light' | 'dark' {
      const c = hex.replace('#', '');
      const r = parseInt(c.substring(0, 2), 16);
      const g = parseInt(c.substring(2, 4), 16);
      const b = parseInt(c.substring(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5 ? 'dark' : 'light';
    }

    render() {
      return super.render(this.renderContent());
    }

    attach(element: HTMLElement) {
      this.loadRefs(element, {});
      return super.attach(element);
    }
  }

  Components.addComponent('riskStratification', RiskStratificationComponent);
}
