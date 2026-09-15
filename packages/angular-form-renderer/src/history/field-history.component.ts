/**
 * <omf-field-history> — previous-value chip + popover under a control
 * (ADR-005 §4), the Angular twin of the React `FieldHistory`.
 *
 *   Previous 138 mm[Hg] · 2h ago · ↑ +6
 *
 * All numbers and words come from form-core (`latestDelta`, `trendPoints`,
 * `relativeAge`, `formatObservationValue`), so the two renderers cannot say
 * different things about the same readings. Renders nothing when the field
 * has no history to show; a provider in flight or failed shows a muted line
 * and never blocks the control.
 */

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  type OnChanges,
  type OnDestroy,
  type OnInit,
  inject,
} from '@angular/core';
import type { UISchemaElement } from '@jsonforms/core';
import type { Observation, OmfCoding, OmfHistoryOptions } from '@openmedform/form-schema-types';
import {
  formatClock,
  formatObservationValue,
  hasMixedUnits,
  historyKeyForPath,
  latestDelta,
  mergeHistory,
  observationAuthor,
  relativeAge,
  trendPoints,
  type Delta,
  type TrendPoint,
} from '@openmedform/form-core';
import type { Subscription } from 'rxjs';
import { HISTORY_STYLES } from '../styles';
import { readOmf } from '../testers';
import { HistoryScopeService } from './history-scope.service';

const DEFAULT_COUNT = 5;
const SPARK_W = 220;
const SPARK_H = 36;
const SPARK_PAD = 3;

interface Row {
  clock: string;
  age: string;
  value: string;
  author: string;
}

@Component({
  selector: 'omf-field-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (active) {
      @if (observations.length === 0) {
        @if (loading) { <span class="omf-history omf-history-loading">Loading previous values…</span> }
        @else if (failed) { <span class="omf-history omf-history-error">Previous values unavailable</span> }
      } @else {
        <div class="omf-history">
          <button
            type="button"
            class="omf-history-chip"
            [attr.aria-expanded]="open"
            [attr.aria-controls]="popoverId"
            (click)="open = !open"
          >
            @if (inline) {
              Previous <strong>{{ previousText }}</strong> · {{ previousAge }}
              @if (deltaText) { · {{ deltaText }} }
              @if (unitMismatch) { <span title="Units differ from the current field"> · ⚠︎ units</span> }
            } @else {
              History ({{ observations.length }})
            }
          </button>
          @if (open) {
            <div class="omf-history-popover" role="region" [id]="popoverId" [attr.aria-label]="popoverLabel">
              @if (sparkPoints.length >= 2) {
                <svg
                  class="omf-history-sparkline"
                  [attr.viewBox]="'0 0 ' + sparkW + ' ' + sparkH"
                  [attr.width]="sparkW"
                  [attr.height]="sparkH"
                  role="img"
                  [attr.aria-label]="sparkLabel"
                >
                  <polyline [attr.points]="sparkPath" fill="none" stroke="var(--omf-color-label, #3a4552)" stroke-width="1.5" />
                  <circle [attr.cx]="sparkLastX" [attr.cy]="sparkLastY" r="2.5" fill="var(--omf-color-text, #1c2430)" />
                </svg>
              }
              <table class="omf-history-list">
                <tbody>
                  @for (row of rows; track $index) {
                    <tr>
                      <td class="omf-history-when">{{ row.clock }} <span class="omf-history-age">{{ row.age }}</span></td>
                      <td class="omf-history-value">{{ row.value }}</td>
                      <td class="omf-history-author">{{ row.author }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              @if (loading) { <div class="omf-history-refreshing">Refreshing…</div> }
            </div>
          }
        </div>
      }
    }
  `,
  styles: [HISTORY_STYLES],
})
export class FieldHistoryComponent implements OnInit, OnChanges, OnDestroy {
  /** The control's JSON Forms data path (`propsPath`), indices included for record rows. */
  @Input({ required: true }) path!: string;
  @Input() uischema: UISchemaElement | undefined;
  /** The control's current value, for the delta arrow. */
  @Input() value: unknown;
  /** The field label, for the popover's accessible name. */
  @Input() label: string | undefined;

  private static seq = 0;
  readonly popoverId = `omf-history-${++FieldHistoryComponent.seq}`;
  readonly sparkW = SPARK_W;
  readonly sparkH = SPARK_H;

  private readonly scope = inject(HistoryScopeService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private scopeSub?: Subscription;
  private fetchSeq = 0;

  active = false;
  open = false;
  loading = false;
  failed = false;
  observations: Observation[] = [];
  private fetched: Observation[] | null = null;
  private lastFetchKey = '';

  ngOnInit(): void {
    this.scopeSub = this.scope?.changes.subscribe(() => this.recompute(true));
  }

  ngOnChanges(): void {
    this.recompute(false);
  }

  ngOnDestroy(): void {
    this.scopeSub?.unsubscribe();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) {
      this.open = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      this.open = false;
      this.cdr.markForCheck();
    }
  }

  // --- derived display -----------------------------------------------------

  private get config(): OmfHistoryOptions | undefined {
    return readOmf(this.uischema)?.['history'] as OmfHistoryOptions | undefined;
  }
  private get coding(): OmfCoding[] | undefined {
    const c = readOmf(this.uischema)?.['coding'];
    return Array.isArray(c) && c.length > 0 ? (c as OmfCoding[]) : undefined;
  }
  private get key(): string {
    return historyKeyForPath(this.path ?? '');
  }
  private get count(): number {
    return this.config?.count ?? DEFAULT_COUNT;
  }
  get inline(): boolean {
    return this.config?.show === 'inline';
  }
  get popoverLabel(): string {
    return `Previous values${this.label ? ` for ${this.label}` : ''}`;
  }

  private get previous(): Observation | undefined {
    return this.observations[0];
  }
  private get delta(): Delta | undefined {
    const prev = this.previous;
    const v = this.value;
    if (!prev || v === '' || v === null || v === undefined) return undefined;
    const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) ? latestDelta(n, prev) : undefined;
  }
  get previousText(): string {
    return this.previous ? formatObservationValue(this.previous) : '';
  }
  get previousAge(): string {
    return this.previous ? relativeAge(this.previous.effectiveAt) : '';
  }
  get unitMismatch(): boolean {
    return this.delta?.unitMismatch === true;
  }
  get deltaText(): string {
    const d = this.delta;
    if (!d || d.unitMismatch) return '';
    const glyph = d.direction === 'up' ? '↑' : d.direction === 'down' ? '↓' : '→';
    const rounded = Math.round(d.delta * 100) / 100;
    return `${glyph} ${rounded > 0 ? `+${rounded}` : rounded}`;
  }

  get rows(): Row[] {
    const now = Date.now();
    const mixed = hasMixedUnits(this.observations);
    return this.observations.map((o, i) => ({
      clock: formatClock(o.effectiveAt),
      age: relativeAge(o.effectiveAt, now),
      value: formatObservationValue(o, { unit: mixed || i === 0 }),
      author: observationAuthor(o) ?? '',
    }));
  }

  get sparkPoints(): TrendPoint[] {
    return this.config?.trend === false ? [] : trendPoints(this.observations);
  }
  private sparkX(t: number): number {
    const ts = this.sparkPoints.map((p) => p.t);
    const t0 = Math.min(...ts);
    const t1 = Math.max(...ts);
    return t1 === t0 ? SPARK_W / 2 : SPARK_PAD + ((t - t0) / (t1 - t0)) * (SPARK_W - 2 * SPARK_PAD);
  }
  private sparkY(v: number): number {
    const vs = this.sparkPoints.map((p) => p.v);
    const v0 = Math.min(...vs);
    const v1 = Math.max(...vs);
    return v1 === v0 ? SPARK_H / 2 : SPARK_H - SPARK_PAD - ((v - v0) / (v1 - v0)) * (SPARK_H - 2 * SPARK_PAD);
  }
  get sparkPath(): string {
    return this.sparkPoints.map((p) => `${this.sparkX(p.t).toFixed(1)},${this.sparkY(p.v).toFixed(1)}`).join(' ');
  }
  get sparkLastX(): string {
    const last = this.sparkPoints[this.sparkPoints.length - 1];
    return last ? this.sparkX(last.t).toFixed(1) : '0';
  }
  get sparkLastY(): string {
    const last = this.sparkPoints[this.sparkPoints.length - 1];
    return last ? this.sparkY(last.v).toFixed(1) : '0';
  }
  get sparkLabel(): string {
    const pts = this.sparkPoints;
    return pts.length ? `Trend of ${pts.length} readings from ${pts[0].v} to ${pts[pts.length - 1].v}` : '';
  }

  // --- state ---------------------------------------------------------------

  private recompute(scopeChanged: boolean): void {
    const state = this.scope?.state ?? null;
    const config = this.config;
    this.active = Boolean(state && config && config.show !== 'none');
    if (!this.active || !state) {
      this.observations = [];
      this.cdr.markForCheck();
      return;
    }
    const key = this.key;
    const fetchKey = `${key}|${this.count}|${(this.coding ?? []).map((c) => `${c.system}|${c.code}`).join(',')}`;
    if (state.provider && (scopeChanged || fetchKey !== this.lastFetchKey)) {
      this.lastFetchKey = fetchKey;
      this.fetch(state.provider, key);
    }
    this.observations = mergeHistory(state.aligned.get(key) ?? [], this.fetched ?? []).slice(0, this.count);
    this.cdr.markForCheck();
  }

  private fetch(provider: NonNullable<HistoryScopeState['provider']>, key: string): void {
    const seq = ++this.fetchSeq;
    this.loading = true;
    this.failed = false;
    const coding = this.coding;
    provider({ ...(coding ? { coding } : {}), path: key, limit: this.count })
      .then((rows) => {
        if (seq !== this.fetchSeq) return;
        this.fetched = rows;
        this.recompute(false);
      })
      .catch(() => {
        if (seq !== this.fetchSeq) return;
        this.failed = true;
      })
      .finally(() => {
        if (seq !== this.fetchSeq) return;
        this.loading = false;
        this.cdr.markForCheck();
      });
  }
}

type HistoryScopeState = NonNullable<HistoryScopeService['state']>;
