/**
 * Layout renderers — VerticalLayout, HorizontalLayout, Group, Label.
 *
 * Each iterates its child UI elements and dispatches them through
 * `<jsonforms-outlet>`, which resolves the right renderer via the registered
 * testers (same dispatch model as the React tree). Spacing/typography come from
 * the shared design tokens, so a two-column HorizontalLayout matches React.
 *
 * CHANGE DETECTION: these containers use OnPush. On a large clinical form this
 * is the difference between re-checking the WHOLE tree on every keystroke and
 * re-checking only the path from root to the edited control. It is safe because:
 * - the edited control's own DOM event marks its path to root dirty, so the
 *   active field always re-renders;
 * - the only containers with live, data-driven state (scored Group subtotals and
 *   the score summary) subscribe to the store and call markForCheck themselves;
 * - `childProps` returns a memoized reference so re-checks don't churn outlets.
 * Known limitation: JSON Forms `rule`-driven visibility/enablement or cross-field
 * validation on a NON-edited control in a sibling branch may not refresh until
 * that control is next interacted with (the @jsonforms/angular base control does
 * not markForCheck). Current forms carry no conditional rules; if that changes,
 * the leaf control wrappers would need their own markForCheck on state updates.
 */

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Directive,
  inject,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
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
  // Cache the render-props object per child element so the same reference is
  // returned across change-detection passes. The <jsonforms-outlet> [renderProps]
  // @Input setter only fires when the bound value's reference changes, so a
  // stable reference stops container re-checks (esp. under OnPush, when a scored
  // group re-checks on a subtotal update) from re-running the outlet's dispatch.
  private readonly propsCache = new Map<UISchemaElement, OwnPropsOfRenderer>();
  private cacheKey?: string;

  get elements(): UISchemaElement[] {
    return this.uischema?.elements ?? [];
  }

  childProps(element: UISchemaElement): OwnPropsOfRenderer {
    // Invalidate if this layout instance is reused for a different scope/schema.
    const key = `${this.path ?? ''}`;
    if (key !== this.cacheKey) {
      this.propsCache.clear();
      this.cacheKey = key;
    }
    let cached = this.propsCache.get(element);
    if (!cached) {
      cached = { uischema: element, schema: this.schema, path: this.path };
      this.propsCache.set(element, cached);
    }
    return cached;
  }
}

@Component({
  selector: 'omf-vertical-layout',
  standalone: true,
  imports: [JsonFormsOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
      <div class="omf-group" [style.border-color]="accentColor">
        @if (groupLabel) {
          <div class="omf-group-header" [style.color]="accentColor" [style.border-bottom-color]="accentColor">
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
          </div>
        }
        <div class="omf-group-body">
          @for (element of elements; track $index) {
            <jsonforms-outlet [renderProps]="childProps(element)"></jsonforms-outlet>
          }
        </div>
      </div>
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
  private readonly cdr = inject(ChangeDetectorRef);
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
        this.cdr.markForCheck(); // OnPush: the async subtotal update must mark the view.
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  // white-space: pre-line preserves the source line breaks so a multi-line /
  // dash-bulleted instruction block stays one item per line (matching the paper)
  // instead of collapsing into a single run-on line. See the React OmfLabel.
  template: `<p class="omf-group-title" style="white-space: pre-line">{{ text }}</p>`,
  styles: [FIELD_STYLES],
})
export class LabelComponent extends JsonFormsBaseRenderer<LabelElement> {
  get text(): string {
    return this.uischema?.text ?? '';
  }
}
export const labelTester = rankWith(STANDARD_RANK, and(uiTypeIs('Label')));
