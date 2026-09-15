import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Observation-history parity guards (ADR-005).
 *
 * The React renderer has mounted tests for the previous-value chip, the
 * provider protocol and the flowsheet. @jsonforms/angular cannot load under
 * vitest (see renderer-set.test.ts), so what is pinned here is that the
 * Angular side draws the SAME form-core model — the alignment rule, the
 * delta, the relative age, the flowsheet grid — instead of re-deriving any of
 * it locally, and that every value control carries the chip. Two renderers
 * disagreeing on "what was the previous reading" is the drift that matters.
 */
const read = (...parts: string[]) => readFileSync(join(__dirname, ...parts), 'utf8');

describe('history scope', () => {
  const service = read('history', 'history-scope.service.ts');
  const form = read('omf-form.component.ts');

  it('aligns batch history through form-core once, at the form root', () => {
    expect(service).toContain('alignHistoryEntries(definition, history ?? [])');
    expect(form).toContain('providers: [HistoryScopeService]');
    expect(form).toContain('this.historyScope.configure(this.definition, this.history, this.historyProvider)');
  });

  it('exposes the same two host inputs as the React renderer', () => {
    expect(form).toContain('@Input() history: HistoryEntry[] | undefined');
    expect(form).toContain('@Input() historyProvider: HistoryProvider | undefined');
  });
});

describe('field history chip', () => {
  const chip = read('history', 'field-history.component.ts');

  it('takes its key, merge, delta, trend and wording from form-core', () => {
    for (const fn of [
      'historyKeyForPath(',
      'mergeHistory(',
      'latestDelta(',
      'trendPoints(',
      'relativeAge(',
      'formatObservationValue(',
      'formatClock(',
      'observationAuthor(',
    ]) {
      expect(chip, fn).toContain(fn);
    }
    // No hand-rolled age or delta arithmetic.
    expect(chip).not.toMatch(/\/\s*3600/);
    expect(chip).not.toMatch(/'h ago'/);
  });

  it('asks the provider with the same query shape (coding, index-free path, limit)', () => {
    expect(chip).toContain('path: key, limit: this.count');
    expect(chip).toContain('...(coding ? { coding } : {})');
  });

  it('never blocks the control: loading and failure are muted lines', () => {
    expect(chip).toContain('Loading previous values…');
    expect(chip).toContain('Previous values unavailable');
  });

  it('respects the designer switch and the two display modes', () => {
    expect(chip).toContain("config.show !== 'none'");
    expect(chip).toContain("this.config?.show === 'inline'");
    expect(chip).toContain('History ({{ observations.length }})');
  });
});

describe('every value control carries the chip', () => {
  const controls = read('renderers', 'controls.ts');
  const omf = read('renderers', 'omf-controls.ts');
  const tag = '<omf-field-history [path]="propsPath" [uischema]="uischema" [value]="data" [label]="label" />';

  it('standard controls: text, number, boolean, enum, date', () => {
    expect(controls.split(tag).length - 1).toBe(5);
    expect(controls).toContain('imports: [FieldHistoryComponent]');
  });

  it('omf controls: textarea and both radio layouts', () => {
    expect(omf.split(tag).length - 1).toBe(3);
  });
});

describe('flowsheet', () => {
  const sheet = read('flowsheet.component.ts');

  it('draws the form-core grid model rather than its own', () => {
    expect(sheet).toContain('buildFlowsheet(this.definition, all, {');
    expect(sheet).toContain('projectObservations(e.definition ?? this.definition, e.data, {');
    expect(sheet).toContain('sameDay(');
  });

  it('exposes the same inputs as the React Flowsheet', () => {
    for (const input of ['entries', 'observations', 'maxColumns', 'includeEmptyRows', 'title', 'emptyLabel', 'timeZone']) {
      expect(sheet, input).toMatch(new RegExp(`@Input\\(\\) ${input}\\b`));
    }
  });

  it('strikes superseded readings through and paints its own surface', () => {
    expect(sheet).toContain('cell.superseded');
    expect(sheet).toContain('<s class="omf-flowsheet-superseded"');
    expect(read('styles.ts')).toContain('.omf-flowsheet-grid td { text-align: center; background: #fff; }');
  });
});
