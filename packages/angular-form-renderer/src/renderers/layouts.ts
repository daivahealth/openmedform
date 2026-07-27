/**
 * Layout renderers — VerticalLayout, HorizontalLayout, Group, Label.
 *
 * Each iterates its child UI elements and dispatches them through
 * `<jsonforms-outlet>`, which resolves the right renderer via the registered
 * testers (same dispatch model as the React tree). Spacing/typography come from
 * the shared design tokens, so a two-column HorizontalLayout matches React.
 */

import { Component, Directive, inject, type OnDestroy, type OnInit } from '@angular/core';
import {
  JsonFormsAngularService,
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
import { collectScoreItems, computeScore } from '@openmedform/form-core';
import { distinctUntilChanged, map, type Subscription } from 'rxjs';
import { FIELD_STYLES } from '../styles';
import { STANDARD_RANK } from '../testers';
import { pointColor, readOmf } from '../point-value';

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
    @if (isSubsection) {
      <div class="omf-subsection">
        @if (groupLabel) { <div class="omf-subsection-title">{{ groupLabel }}</div> }
        <div class="omf-subsection-body" [style.border-left-color]="accentColor || '#c8cdd4'">
          @for (element of elements; track $index) {
            <jsonforms-outlet [renderProps]="childProps(element)"></jsonforms-outlet>
          }
        </div>
      </div>
    } @else {
      <fieldset class="omf-group" [style.border-color]="accentColor">
        @if (groupLabel) {
          <legend class="omf-group-header" [style.color]="accentColor">
            @if (icon) { <span class="omf-icon">{{ icon }}</span> }
            <span class="omf-group-title">{{ groupLabel }}</span>
            @if (legend.length) {
              <span class="omf-legend">
                @for (p of legend; track p) {
                  <span class="omf-point-badge" [style.color]="badgeFg(p)" [style.background]="badgeBg(p)">{{ p }}</span>
                }
              </span>
            }
            @if (subtotal !== null) {
              <span class="omf-point-badge" [style.color]="accentColor || '#3a4552'" title="Section subtotal">Σ {{ subtotal }}</span>
            }
          </legend>
        }
        @for (element of elements; track $index) {
          <jsonforms-outlet [renderProps]="childProps(element)"></jsonforms-outlet>
        }
      </fieldset>
    }
  `,
  styles: [
    FIELD_STYLES,
    `
    .omf-subsection { margin-bottom: var(--omf-section-gap, 20px); }
    .omf-subsection-title { font-weight: var(--omf-label-weight, 600); font-size: var(--omf-font-size-label, 13px); color: var(--omf-color-label, #3a4552); margin-bottom: var(--omf-field-gap, 12px); }
    .omf-subsection-body { margin-left: var(--omf-subsection-indent, 20px); border-left: 2px solid #c8cdd4; padding-left: var(--omf-control-padding, 8px); }
    `,
  ],
})
export class GroupLayoutComponent extends OmfLayoutBase implements OnInit, OnDestroy {
  private readonly jsonForms = inject(JsonFormsAngularService);
  private sub?: Subscription;
  /** Live section subtotal; null when this box has no scored descendants. */
  subtotal: number | null = null;

  get groupLabel(): string {
    const l = (this.uischema as { label?: unknown })?.label;
    return typeof l === 'string' ? l : '';
  }
  get isSubsection(): boolean {
    return readOmf(this.uischema)?.['variant'] === 'subsection';
  }
  get accentColor(): string | null {
    const c = readOmf(this.uischema)?.['accentColor'];
    return typeof c === 'string' ? c : null;
  }
  get icon(): string | null {
    const i = readOmf(this.uischema)?.['icon'];
    if (typeof i !== 'string') return null;
    // Avoid a double glyph when the AI also embedded the icon in the label text.
    const rawLabel = (this.uischema as { label?: unknown })?.label;
    const label = typeof rawLabel === 'string' ? rawLabel : '';
    return label.includes(i) ? null : i;
  }
  get legend(): number[] {
    const l = readOmf(this.uischema)?.['pointLegend'];
    return Array.isArray(l) ? (l as number[]) : [];
  }
  badgeFg(points: number): string {
    return pointColor(points).fg;
  }
  badgeBg(points: number): string {
    return pointColor(points).bg;
  }

  ngOnInit(): void {
    const items = this.uischema ? collectScoreItems(this.uischema as never) : [];
    if (items.length === 0) return; // non-scored boxes never subscribe.
    // Recompute the subtotal only when the response data changes — not on every
    // $state emission (validation/config/focus), which multiplied across every
    // scored group was a perf hot-spot.
    this.sub = this.jsonForms.$state
      .pipe(
        map((state) => state?.jsonforms?.core?.data),
        distinctUntilChanged(),
      )
      .subscribe((data) => {
        this.subtotal = computeScore(items, data ?? {}).total;
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
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
