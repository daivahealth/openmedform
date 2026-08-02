import { Component, signal } from '@angular/core';
import { OmfFormComponent } from '@openmedform/angular-form-renderer';
import { rrtSbarReference } from '@openmedform/form-core';
import type { JsonFormsFormDefinition } from '@openmedform/form-schema-types';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [OmfFormComponent],
  template: `
    <div class="page">
      <header>
        <h1>OpenMedForm — Angular JSON Forms Demo</h1>
        <p>
          The same jsonforms <code>FormDefinition</code> the React demo renders,
          drawn here by the Angular engine over the shared form-core + design tokens.
        </p>
      </header>
      <div class="grid">
        <section class="card">
          <h2>{{ definition.name }}</h2>
          <omf-form
            [definition]="definition"
            [data]="data()"
            (dataChange)="data.set($event)"
          ></omf-form>
        </section>
        <section class="card">
          <h2>{{ conditional.name }}</h2>
          <p class="hint">
            Set <strong>Site</strong> to <em>Other</em>: the "Please specify…" field and the
            "Other details" group appear via SHOW rules — the shape HTML conversion emits for a
            mock-up's hidden conditional field.
          </p>
          <omf-form
            [definition]="conditional"
            [data]="conditionalData()"
            (dataChange)="conditionalData.set($event)"
          ></omf-form>
        </section>
        <aside>
          <h3>Live data</h3>
          <pre>{{ dataJson() }}</pre>
        </aside>
      </div>
    </div>
  `,
  styles: [
    `
      .page { font-family: system-ui, sans-serif; max-width: 1100px; margin: 0 auto; padding: 24px; }
      h1 { font-size: 22px; margin: 0; }
      header p { color: #555; }
      .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; align-items: start; }
      .card { border: 1px solid #e2e5ea; border-radius: 8px; padding: 16px; }
      .card h2 { font-size: 15px; margin-top: 0; }
      .card .hint { font-size: 12px; color: #666; margin-top: 0; }
      aside h3 { font-size: 13px; text-transform: uppercase; color: #666; }
      pre { background: #0f1420; color: #d6e2f0; padding: 12px; border-radius: 8px; font-size: 12px; max-height: 480px; overflow: auto; }
    `,
  ],
})
export class AppComponent {
  readonly definition: JsonFormsFormDefinition = rrtSbarReference;
  readonly data = signal<Record<string, unknown>>({});

  /**
   * Conditional visibility, rendered by the Angular engine. Controls honoured
   * rules already; layouts and Labels did not until the rule-aware base landed,
   * so the Group here is the parity check against the React demo.
   */
  readonly conditional: JsonFormsFormDefinition = {
    ...rrtSbarReference,
    name: 'Conditional visibility (SHOW rules)',
    dataSchema: {
      type: 'object',
      properties: {
        site: { type: 'string', title: 'Site', enum: ['FOREARM', 'OTHER'] },
        siteOther: { type: 'string', title: 'Please specify…' },
        otherNote: { type: 'string', title: 'Note' },
      },
    },
    uiSchema: {
      schemaVersion: '1.0',
      layout: {
        type: 'VerticalLayout',
        elements: [
          { type: 'Control', scope: '#/properties/site' },
          {
            type: 'Control',
            scope: '#/properties/siteOther',
            rule: {
              effect: 'SHOW',
              condition: { scope: '#/properties/site', schema: { const: 'OTHER' } },
            },
          },
          {
            type: 'Group',
            label: 'Other details',
            rule: {
              effect: 'SHOW',
              condition: { scope: '#/properties/site', schema: { const: 'OTHER' } },
            },
            elements: [{ type: 'Control', scope: '#/properties/otherNote' }],
          },
        ],
      },
    },
  };
  readonly conditionalData = signal<Record<string, unknown>>({});

  dataJson(): string {
    return JSON.stringify(this.data(), null, 2);
  }
}
