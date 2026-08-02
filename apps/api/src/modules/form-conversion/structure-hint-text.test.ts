import { describe, expect, it } from 'vitest';

import type { TransposedMatrixHint } from '../../common/utils/html-extract';
import { repeatingLogHintText, transposedMatrixHintText } from './structure-hint-text';

const MATRIX: TransposedMatrixHint = {
  labelHeader: 'Parameter',
  rowLabels: ['Date of Insertion', 'Site', 'Side', 'Day & Date', 'VIP Score'],
  instanceHeaders: ['Cannula 1'],
  addInstanceLabel: '+ Add Cannula',
  addNestedLabel: '+ Day',
};

describe('structure hint text', () => {
  // The point of this module: markup, geometry and page-image sources must all
  // give the model the SAME instruction. Only the evidence clause may differ —
  // a hint that reads differently by source is a second prompt to keep in step.
  it('gives the same instruction whether the matrix came from markup or a page', () => {
    const fromMarkup = transposedMatrixHintText(MATRIX, 'markup');
    const fromPage = transposedMatrixHintText(MATRIX, 'page');

    for (const text of [fromMarkup, fromPage]) {
      expect(text).toContain('MATRIX TABLE');
      expect(text).toContain('exactly these 5 fields');
      expect(text).toContain('"Cannula 1" is an INSTANCE NAME');
      expect(text).toContain('options.omf.recordTable.addLabel to "+ Add Cannula"');
      for (const row of MATRIX.rowLabels) expect(text).toContain(`"${row}"`);
    }

    // The only difference is where it was observed.
    expect(fromPage).toContain('read off the page image');
    expect(fromMarkup).not.toContain('page image');
    expect(fromPage.replace(' was read off the page image and', '')).toBe(fromMarkup);
  });

  it('carries a measured nested split through, when there is one', () => {
    const measured = { ...MATRIX, nestedRowLabels: ['Day & Date', 'VIP Score'] };

    const text = transposedMatrixHintText(measured, 'markup');
    expect(text).toContain('THE SPLIT IS MEASURED, NOT A SUGGESTION');
    expect(text).toContain('"Day & Date", "VIP Score"');
  });

  it('omits the measured-split paragraph when nothing was measured', () => {
    // A page probe cannot press anything, so this must never appear there.
    expect(transposedMatrixHintText(MATRIX, 'page')).not.toContain('MEASURED');
  });

  it('describes a log the same way from either source', () => {
    const log = { columns: ['Date', 'Time', 'Score'], addLabel: '+ Add reading' };

    for (const text of [repeatingLogHintText(log, 'markup'), repeatingLogHintText(log, 'page')]) {
      expect(text).toContain('REPEATING LOG');
      expect(text).toContain('[Date | Time | Score]');
      expect(text).toContain('options.omf.control "recordTable"');
      expect(text).toContain('addLabel to "+ Add reading"');
    }
  });

  it('still names an addLabel for a printed log that has no button', () => {
    // Paper forms have blank rows, not buttons, but the renderer still needs a
    // label on the add control it draws.
    const text = repeatingLogHintText({ columns: ['Date', 'Signature'] }, 'page');

    expect(text).toContain('blank rows to fill in');
    expect(text).toContain('addLabel to "Add row"');
  });
});
