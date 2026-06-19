export function registerSignatureDate(Formio: any) {
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
          nameLabel: 'Printed Name',
          roleLabel: 'Role / Designation',
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

    renderContent() {
      const data = this.root?.data || {};
      const key = this.component.key;
      const sigData = data[key] || {};
      const name = sigData.name || '';
      const role = sigData.role || '';
      const date = sigData.date || new Date().toISOString().split('T')[0];

      const readOnly = this.options?.readOnly;

      if (readOnly) {
        return `<div class="signature-date" style="border:1px solid #dee2e6;border-radius:8px;padding:16px">
          <div style="display:flex;gap:24px;flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
              <div style="font-size:12px;color:#6c757d;margin-bottom:4px">${this.t(this.component.nameLabel || 'Printed Name')}</div>
              <div style="border-bottom:1px solid #000;padding:4px 0;min-height:24px">${name}</div>
            </div>
            <div style="flex:1;min-width:150px">
              <div style="font-size:12px;color:#6c757d;margin-bottom:4px">${this.t(this.component.roleLabel || 'Role / Designation')}</div>
              <div style="border-bottom:1px solid #000;padding:4px 0;min-height:24px">${role}</div>
            </div>
            <div style="min-width:150px">
              <div style="font-size:12px;color:#6c757d;margin-bottom:4px">Date</div>
              <div style="border-bottom:1px solid #000;padding:4px 0;min-height:24px">${date}</div>
            </div>
          </div>
        </div>`;
      }

      return `<div class="signature-date" style="border:1px solid #dee2e6;border-radius:8px;padding:16px" ref="signatureContainer">
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <label style="font-size:12px;color:#6c757d;display:block;margin-bottom:4px">${this.t(this.component.nameLabel || 'Printed Name')}</label>
            <input type="text" ref="nameInput" class="form-control" value="${this.escapeHtml(name)}" placeholder="Enter full name" style="width:100%" />
          </div>
          <div style="flex:1;min-width:150px">
            <label style="font-size:12px;color:#6c757d;display:block;margin-bottom:4px">${this.t(this.component.roleLabel || 'Role / Designation')}</label>
            <input type="text" ref="roleInput" class="form-control" value="${this.escapeHtml(role)}" placeholder="e.g., Attending Physician" style="width:100%" />
          </div>
          <div style="min-width:150px">
            <label style="font-size:12px;color:#6c757d;display:block;margin-bottom:4px">Date</label>
            <input type="date" ref="dateInput" class="form-control" value="${date}" style="width:100%" />
          </div>
        </div>
      </div>`;
    }

    escapeHtml(str: string): string {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    render() {
      return super.render(this.renderContent());
    }

    attach(element: HTMLElement) {
      this.loadRefs(element, {
        signatureContainer: 'single',
        nameInput: 'single',
        roleInput: 'single',
        dateInput: 'single',
      });

      const updateValue = () => {
        const name = (this.refs as any).nameInput?.value || '';
        const role = (this.refs as any).roleInput?.value || '';
        const date = (this.refs as any).dateInput?.value || '';
        this.updateValue({ name, role, date });
      };

      if ((this.refs as any).nameInput) {
        (this.refs as any).nameInput.addEventListener('change', updateValue);
      }
      if ((this.refs as any).roleInput) {
        (this.refs as any).roleInput.addEventListener('change', updateValue);
      }
      if ((this.refs as any).dateInput) {
        (this.refs as any).dateInput.addEventListener('change', updateValue);
      }

      return super.attach(element);
    }
  }

  Components.addComponent('signatureDate', SignatureDateComponent);
}
