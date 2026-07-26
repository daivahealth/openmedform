/**
 * scoreSummary — Angular counterpart of the React live cross-section total.
 *
 * Reads the whole-form data + root UI schema from the JsonForms store and sums
 * every ticked `options.omf.points` via form-core's single scoring source of
 * truth (same code the React renderer and the backend derivation mirror), so
 * the total, per-section subtotals, and risk band match across frameworks.
 * Display aid only — the server recomputes the authoritative score.
 */

import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { JsonFormsAngularService, JsonFormsBaseRenderer } from '@jsonforms/angular';
import { rankWith, type ControlElement, type UISchemaElement } from '@jsonforms/core';
import { collectScoreItems, computeScore, type RiskBand, type ScoreItem } from '@openmedform/form-core';
import type { Subscription } from 'rxjs';
import { FIELD_STYLES } from '../styles';
import { OMF_CONTROL_RANK, omfControlIs, readOmf } from '../testers';

@Component({
  selector: 'omf-score-summary',
  standalone: true,
  template: `
    <div class="omf-score">
      <div class="omf-score-head">
        <span class="omf-score-title">{{ title }}</span>
        <span class="omf-score-figure">
          <span class="omf-score-total">{{ total }}</span>
          @if (riskLabel) {
            <span
              class="omf-score-band"
              [style.color]="riskColor || '#3a4552'"
              [style.border-color]="riskColor || '#3a4552'"
            >{{ riskLabel }}</span>
          }
        </span>
      </div>
      @if (sections.length) {
        <table class="omf-table">
          <tbody>
            @for (s of sections; track s[0]) {
              <tr><td>{{ s[0] }}</td><td style="text-align:right;font-weight:600;width:80px">{{ s[1] }}</td></tr>
            }
          </tbody>
        </table>
      }
      <div class="omf-score-note">Live total — the server recalculates the authoritative score on submission.</div>
    </div>
  `,
  styles: [
    FIELD_STYLES,
    `
    .omf-score { border: var(--omf-border-width,1px) solid var(--omf-color-border,#c8cdd4); border-radius: var(--omf-border-radius,4px); margin-bottom: var(--omf-section-gap,20px); overflow: hidden; }
    .omf-score-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; background: var(--omf-color-section-bg,#f7f8fa); border-bottom: var(--omf-border-width,1px) solid var(--omf-color-border,#c8cdd4); padding: var(--omf-control-padding,8px); }
    .omf-score-title { font-weight: var(--omf-label-weight,600); font-size: var(--omf-font-size-label,13px); color: var(--omf-color-label,#3a4552); }
    .omf-score-figure { display:inline-flex; align-items:baseline; gap:10px; }
    .omf-score-total { font-size:22px; font-weight:800; line-height:1; }
    .omf-score-band { padding:2px 10px; border-radius:999px; border:1px solid; font-size: var(--omf-font-size-help,12px); font-weight:700; }
    .omf-score-note { padding: var(--omf-control-padding,8px); font-size: var(--omf-font-size-help,12px); color: var(--omf-color-help,#6b7684); }
    `,
  ],
})
export class ScoreSummaryComponent
  extends JsonFormsBaseRenderer<ControlElement>
  implements OnInit, OnDestroy
{
  private readonly jsonForms = inject(JsonFormsAngularService);
  private sub?: Subscription;
  private items: ScoreItem[] = [];
  total = 0;
  bySection: Record<string, number> = {};
  riskLabel?: string;
  riskColor?: string;

  get title(): string {
    return (this.uischema?.label as string) || 'Total Score';
  }
  get bands(): RiskBand[] | undefined {
    const b = readOmf(this.uischema)?.['bands'];
    return Array.isArray(b) ? (b as RiskBand[]) : undefined;
  }
  get sections(): Array<[string, number]> {
    return Object.entries(this.bySection);
  }

  ngOnInit(): void {
    this.sub = this.jsonForms.$state.subscribe((state) => {
      const core = state?.jsonforms?.core;
      const rootUi = core?.uischema as unknown as UISchemaElement | undefined;
      this.items = rootUi ? collectScoreItems(rootUi as never) : [];
      const r = computeScore(this.items, core?.data ?? {}, this.bands);
      this.total = r.total;
      this.bySection = r.bySection;
      this.riskLabel = r.riskLabel;
      this.riskColor = r.riskColor;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}

export const scoreSummaryTester = rankWith(OMF_CONTROL_RANK, omfControlIs('scoreSummary'));
