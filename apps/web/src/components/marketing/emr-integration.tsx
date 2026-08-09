import { ArrowRight, Code2, Download, FileUp } from 'lucide-react';

const STEPS = [
  {
    icon: FileUp,
    step: '1',
    title: 'Upload your hardcopy',
    body: 'Scan or photograph your existing paper form and upload the PDF or image. AI converts it into a digital clinical form — fields, sections and scoring included.',
  },
  {
    icon: Download,
    step: '2',
    title: 'Download the form JSON',
    body: 'Every form is a single portable, versioned JSON definition. Export it from the forms list with one click.',
  },
  {
    icon: Code2,
    step: '3',
    title: 'Render it in your EMR',
    body: 'Install the React, Angular or Flutter renderer, load the JSON, and the form appears natively in your product — web or mobile. Submissions are plain JSON for your own database.',
  },
];

/** 3-step visual flow: hardcopy -> JSON -> embedded renderer. */
export function IntegrationSteps() {
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
      {STEPS.map((s, i) => (
        <div key={s.step} className="contents">
          <div className="relative rounded-xl border bg-card p-6 pt-8 shadow-sm">
            <div className="absolute -top-4 left-6 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {s.step}
            </div>
            <s.icon className="mb-3 h-6 w-6 text-primary" />
            <h3 className="mb-1 font-semibold">{s.title}</h3>
            <p className="text-sm text-muted-foreground">{s.body}</p>
          </div>
          {i < STEPS.length - 1 && (
            <div className="hidden items-center md:flex">
              <ArrowRight className="h-6 w-6 text-muted-foreground/50" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const SNIPPETS = [
  {
    label: 'React',
    install: 'npm install @openmedform/react-form-renderer',
    code: `import { FormRenderer } from '@openmedform/react-form-renderer';

function EncounterForm({ formJson }) {
  return (
    <FormRenderer
      definition={formJson}   // the JSON you downloaded
      onSubmit={(result) => saveToYourDb(result)}
    />
  );
}`,
  },
  {
    label: 'Angular',
    install: 'npm install @openmedform/angular-form-renderer',
    code: `import { OmfFormComponent } from '@openmedform/angular-form-renderer';

@Component({
  standalone: true,
  imports: [OmfFormComponent],
  template: \`
    <omf-form
      [definition]="formJson"
      (dataChange)="saveToYourDb($event)"
    ></omf-form>\`,
})
export class EncounterFormComponent {}`,
  },
  {
    label: 'Flutter',
    labelLink: 'https://github.com/daivahealth/openmedform-flutter',
    install: `# pubspec.yaml
dependencies:
  openmedform_flutter_renderer:
    git:
      url: https://github.com/daivahealth/openmedform-flutter.git
      path: packages/openmedform_flutter_renderer`,
    code: `import 'package:openmedform_flutter_renderer/openmedform_flutter_renderer.dart';

OmfFormRenderer(
  definition: definition,  // the JSON you downloaded
  onChange: (data) => saveToYourDb(data),
)`,
  },
];

/** Install + usage snippets, one card per renderer package. */
export function RendererInstall() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {SNIPPETS.map((s) => (
        <div key={s.label} className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">
            {'labelLink' in s && s.labelLink ? (
              <a
                href={s.labelLink}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-primary"
              >
                {s.label} ↗
              </a>
            ) : (
              s.label
            )}
          </div>
          <div className="space-y-3 p-4">
            <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
              <code>{s.install}</code>
            </pre>
            <pre className="overflow-x-auto rounded-md bg-zinc-950 px-3 py-2 text-xs text-zinc-100">
              <code>{s.code}</code>
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}
