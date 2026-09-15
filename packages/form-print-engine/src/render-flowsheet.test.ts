import { describe, expect, it } from 'vitest';
import { formatClock, vitalsHistoryEntries, vitalsHistoryReference } from '@openmedform/form-core';
import type { Observation } from '@openmedform/form-schema-types';
import { renderFlowsheetHtml } from './render-flowsheet';

const NOW = new Date('2026-09-15T14:00:00Z');
const entries = vitalsHistoryEntries(NOW);

describe('renderFlowsheetHtml', () => {
  const html = renderFlowsheetHtml(vitalsHistoryReference, {
    entries,
    title: 'Ward vitals',
    headerLines: ['Bed 12', 'Shift: day'],
    timeZone: 'UTC',
    footer: 'Printed by RN Priya',
  });

  it('is an A4 landscape document with the default margins and a repeating header', () => {
    expect(html).toContain('@page { size: A4 landscape; margin: 12mm 10mm 12mm 10mm; }');
    expect(html).toContain('.omf-fs thead { display: table-header-group; }');
    expect(html).toContain('<h1 class="omf-print-title">Ward vitals</h1>');
    expect(html).toContain('<div>Bed 12</div><div>Shift: day</div>');
    expect(html).toContain('Printed by RN Priya');
  });

  it('puts occurrences across the top newest first, with authors, and parameters down the left in form order', () => {
    const heads = [...html.matchAll(/<th class="omf-fs-col"><div>([\d:]+)<\/div>(.*?)<\/th>/g)].map((m) => [m[1], m[2]]);
    // The fixture's times are local-clock relative; compare against the same formatter.
    const clock = (i: number) => formatClock(entries[i].effectiveAt, { timeZone: 'UTC' });
    expect(heads.map((h) => h[0])).toEqual([clock(2), clock(1), clock(0)]);
    expect(heads[0][1]).toContain('RN Arun');
    expect(heads[1][1]).toContain('RN Priya');
    const params = [...html.matchAll(/<tr class="omf-fs-row"><th class="omf-fs-param">([^<]+)/g)].map((m) => m[1].trim());
    expect(params).toEqual([
      'Heart rate',
      'Respiratory rate',
      'Systolic BP',
      'Diastolic BP',
      'Temperature (°F)',
      'SpO2',
      'On supplemental oxygen',
      'AVPU',
    ]);
    expect(html).toContain('<tr class="omf-fs-section"><th colspan="4">Observations</th></tr>');
  });

  it('aligns older-version readings by LOINC and shows units per cell when a row mixes them', () => {
    // Heart rate came from vitals.pulse in v2 — it lands in the v3 row.
    expect(html).toMatch(/Heart rate <span class="omf-fs-unit">\/min<\/span><\/th><td>88<\/td><td>92<\/td><td>96<\/td>/);
    // Temperature: °F now, °C before — no row unit, each cell carries its own.
    expect(html).toMatch(/Temperature \(°F\)<\/th><td>98\.6 \[degF\]<\/td><td>37\.1 Cel<\/td><td>37\.4 Cel<\/td>/);
    // Coded answers print their labels, never the stored code.
    expect(html).toContain('<td>Alert</td>');
    expect(html).not.toContain('>ALERT<');
  });

  it('splits wide sheets into page-sized column blocks that repeat the spine', () => {
    const paged = renderFlowsheetHtml(vitalsHistoryReference, { entries, columnsPerPage: 2, timeZone: 'UTC' });
    expect(paged.match(/<section class="omf-fs-block/g)).toHaveLength(2);
    expect(paged).toContain('omf-fs-continued');
    expect(paged).toContain('Observations — continued');
    expect(paged.match(/<th class="omf-fs-param">Parameter<\/th>/g)).toHaveLength(2);
    expect(paged.match(/<th class="omf-fs-col">/g)).toHaveLength(3);
  });

  it('strikes through superseded readings and escapes text', () => {
    const superseded: Observation = {
      path: 'obs.heartRate',
      label: 'Heart rate',
      value: 120,
      unit: '/min',
      coding: [{ system: 'http://loinc.org', code: '8867-4', source: 'human', verified: true }],
      effectiveAt: entries[2].effectiveAt,
      source: { superseded: true },
    };
    const out = renderFlowsheetHtml(vitalsHistoryReference, {
      entries,
      observations: [superseded],
      title: 'A & B <chart>',
      timeZone: 'UTC',
    });
    expect(out).toContain('<s class="omf-fs-superseded">120</s> 88</td>');
    expect(out).toContain('A &amp; B &lt;chart&gt;');
  });

  it('says so when there is nothing to chart, and can print a blank chart to fill by hand', () => {
    expect(renderFlowsheetHtml(vitalsHistoryReference)).toContain('No readings recorded.');
    const blank = renderFlowsheetHtml(vitalsHistoryReference, {
      entries: [entries[2]],
      includeEmptyRows: true,
      timeZone: 'UTC',
    });
    expect(blank).toContain('Notes');
  });
});
