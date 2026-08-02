/**
 * The prompt paragraphs that turn a detected structure into an instruction.
 *
 * These were written for HTML, where the evidence is markup. The same two
 * shapes now also arrive from rendered geometry (a div grid) and from a vision
 * pre-pass over PDF/image pages, and all three must say the SAME thing — a hint
 * that reads differently by source is a second prompt to keep in step, and the
 * conversion quality of these two shapes is the thing most of this pipeline
 * exists to protect.
 *
 * So the text lives here, once, and only the evidence clause varies: the model
 * is told what was observed and where, and everything after that is identical.
 */

import type { RepeatingTableHint, TransposedMatrixHint } from '../../common/utils/html-extract';

/** Where a structure was observed. Changes one clause, nothing else. */
export type HintSource = 'markup' | 'page';

export function repeatingLogHintText(t: RepeatingTableHint, source: HintSource): string {
  const evidence =
    source === 'markup'
      ? `has an empty <tbody> and an "${t.addLabel}" button — the user adds rows to it`
      : t.addLabel
        ? `was read off the page image, with an "${t.addLabel}" control — the user adds rows to it`
        : 'was read off the page image as a printed log with blank rows to fill in';

  return (
    `REPEATING LOG: the table with columns [${t.columns.join(' | ')}] ${evidence}. Emit it as a ` +
    'single array Control with options.omf.control "recordTable", NOT as a Label and ' +
    'not as one Group per column. Set options.omf.recordTable.addLabel to ' +
    `"${t.addLabel ?? 'Add row'}"` +
    (t.countLabel
      ? `, countLabel to "${t.countLabel.replace(/^\d+/, '{n}').replace(/\bdays\b/, 'day{s}')}"`
      : '') +
    ', and columns to one entry per header above (use "pairWith" for a combined ' +
    '"A / B" header and "countOf" for a header that counts nested records). The item ' +
    'schema holds every field of ONE record; put its detail UI in options.detail as an ' +
    '"OmfTabsLayout" whose children are Groups, one per stage of the record.\n\n'
  );
}

export function transposedMatrixHintText(m: TransposedMatrixHint, source: HintSource): string {
  const evidence =
    source === 'markup'
      ? 'is TRANSPOSED'
      : 'was read off the page image and is TRANSPOSED';

  return (
    `MATRIX TABLE: the table headed "${m.labelHeader}" ${evidence} — its ROWS are the ` +
    `fields of ONE record and each remaining COLUMN is a separate record instance ` +
    `(${m.instanceHeaders.join(', ')}). ` +
    `Emit ONE array Control with options.omf.control "recordTable" whose item schema has ` +
    `exactly these ${m.rowLabels.length} fields, in this order: ` +
    m.rowLabels.map((l) => `"${l}"`).join(', ') +
    '. ' +
    `"${m.instanceHeaders[0]}" is an INSTANCE NAME, not a field and not a column — never emit it as either. ` +
    (m.addInstanceLabel ? `Set options.omf.recordTable.addLabel to "${m.addInstanceLabel}". ` : '') +
    (m.addNestedLabel
      ? `The "${m.addNestedLabel}" control inside a column heading means each record ALSO contains its own ` +
        'repeating group: put the fields that repeat per sub-record into a NESTED array property, and give ' +
        `that nested array its own options.omf.control "recordTable" with addLabel "${m.addNestedLabel}". ` +
        'A nested array left without recordTable config renders as an unusable generic list widget. ' +
        `"${m.addNestedLabel}" is the BUTTON'S OWN TEXT — like the instance name, it is never a field ` +
        'and never a property. Emit it only as the addLabel. '
      : '') +
    // Measured, not inferred: pressing the nested-add control in the sandbox
    // showed exactly which rows belong to the sub-record. Say so emphatically —
    // left to judgement the model splits these wrong.
    (m.nestedRowLabels && m.nestedRowLabels.length > 0
      ? 'THE SPLIT IS MEASURED, NOT A SUGGESTION — the control was actually pressed and these ' +
        `${m.nestedRowLabels.length} rows are the ones that gained a cell, so they belong to the NESTED ` +
        'array and NOT to the outer record: ' +
        m.nestedRowLabels.map((l) => `"${l}"`).join(', ') +
        '. Every other row above belongs to the OUTER record. Do not move a row between the two levels. '
      : '') +
    'Summary columns should be the few most identifying fields, not all of them; the rest belong in ' +
    'options.detail as an OmfTabsLayout.\n\n'
  );
}

/**
 * The framing that precedes page-sourced hints.
 *
 * A markup hint is a fact the extractor proved. A page hint is a vision model's
 * reading of a picture, so it is introduced as an observation the main
 * conversion should reconcile against what it can see — trustworthy enough to
 * steer by, not so trustworthy that a misread heading silently becomes law.
 */
export function pageProbePreamble(count: number): string {
  return (
    `PAGE STRUCTURE: a first pass over the page image(s) identified ${count} repeating ` +
    'table structure(s), described below. Treat this as a careful reading of the pages, not ' +
    'as separate instructions: if the pages plainly show something different, follow the ' +
    'pages and add a NEEDS_REVIEW warning saying so. Otherwise build exactly what is ' +
    'described — these shapes are the ones that convert badly when guessed at.\n\n'
  );
}
