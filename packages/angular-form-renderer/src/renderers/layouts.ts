/**
 * Layout renderers — VerticalLayout, HorizontalLayout, Group, Label.
 *
 * Each iterates its child UI elements and dispatches them through
 * `<jsonforms-outlet>`, which resolves the right renderer via the registered
 * testers (same dispatch model as the React tree). Spacing/typography come from
 * the shared design tokens, so a two-column HorizontalLayout matches React.
 */

import { Component, Directive } from '@angular/core';
import {
  JsonFormsBaseRenderer,
  JsonFormsOutlet,
} from '@jsonforms/angular';
import {
  and,
  type Layout,
  type LabelElement,
  type OwnPropsOfRenderer,
  rankWith,
  uiTypeIs,
  type UISchemaElement,
} from '@jsonforms/core';
import { FIELD_STYLES } from '../styles';
import { STANDARD_RANK } from '../testers';

/** Shared base: exposes the child elements and builds outlet render props. */
@Directive()
export abstract class OmfLayoutBase extends JsonFormsBaseRenderer<Layout> {
  get elements(): UISchemaElement[] {
    return this.uischema?.elements ?? [];
  }

  childProps(element: UISchemaElement): OwnPropsOfRenderer {
    return { uischema: element, schema: this.schema, path: this.path };
  }
}

@Component({
  selector: 'omf-vertical-layout',
  standalone: true,
  imports: [JsonFormsOutlet],
  template: `
    <div class="omf-vertical">
      @for (element of elements; track $index) {
        <jsonforms-outlet [renderProps]="childProps(element)"></jsonforms-outlet>
      }
    </div>
  `,
  styles: [FIELD_STYLES],
})
export class VerticalLayoutComponent extends OmfLayoutBase {}
export const verticalLayoutTester = rankWith(STANDARD_RANK, uiTypeIs('VerticalLayout'));

@Component({
  selector: 'omf-horizontal-layout',
  standalone: true,
  imports: [JsonFormsOutlet],
  template: `
    <div class="omf-row">
      @for (element of elements; track $index) {
        <div class="omf-col">
          <jsonforms-outlet [renderProps]="childProps(element)"></jsonforms-outlet>
        </div>
      }
    </div>
  `,
  styles: [FIELD_STYLES],
})
export class HorizontalLayoutComponent extends OmfLayoutBase {}
export const horizontalLayoutTester = rankWith(STANDARD_RANK, uiTypeIs('HorizontalLayout'));

@Component({
  selector: 'omf-group-layout',
  standalone: true,
  imports: [JsonFormsOutlet],
  template: `
    <fieldset class="omf-group">
      @if (uischema?.label) {
        <legend class="omf-group-title">{{ uischema.label }}</legend>
      }
      @for (element of elements; track $index) {
        <jsonforms-outlet [renderProps]="childProps(element)"></jsonforms-outlet>
      }
    </fieldset>
  `,
  styles: [FIELD_STYLES],
})
export class GroupLayoutComponent extends OmfLayoutBase {}
export const groupTester = rankWith(STANDARD_RANK, uiTypeIs('Group'));

@Component({
  selector: 'omf-label',
  standalone: true,
  template: `<p class="omf-group-title">{{ text }}</p>`,
  styles: [FIELD_STYLES],
})
export class LabelComponent extends JsonFormsBaseRenderer<LabelElement> {
  get text(): string {
    return this.uischema?.text ?? '';
  }
}
export const labelTester = rankWith(STANDARD_RANK, and(uiTypeIs('Label')));
