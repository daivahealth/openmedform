import { describe, it, expect } from 'vitest';
import {
  createRecordDefault,
  fieldsOutsideColumns,
  isColumnEditable,
  EMPTY_CELL,
  readRecordPath,
  recordCellText,
  recordCountText,
} from './summary';

describe('readRecordPath', () => {
  it('reads a nested dot path', () => {
    expect(readRecordPath({ timelog: { cycle: '2' } }, 'timelog.cycle')).toBe('2');
  });

  it('returns undefined for a missing intermediate link rather than throwing', () => {
    expect(readRecordPath({}, 'timelog.cycle')).toBeUndefined();
    expect(readRecordPath({ timelog: null }, 'timelog.cycle')).toBeUndefined();
    expect(readRecordPath(undefined, 'a.b')).toBeUndefined();
  });

  it('returns undefined when no path is configured', () => {
    expect(readRecordPath({ a: 1 }, undefined)).toBeUndefined();
  });
});

describe('recordCellText', () => {
  it('prints a plain value', () => {
    expect(recordCellText({ date: '2026-08-01' }, { label: 'Date', path: 'date' })).toBe(
      '2026-08-01',
    );
  });

  it('prints an em dash for empty, null and missing values', () => {
    const col = { label: 'Nurse', path: 'nurse' };
    expect(recordCellText({ nurse: '' }, col)).toBe(EMPTY_CELL);
    expect(recordCellText({ nurse: null }, col)).toBe(EMPTY_CELL);
    expect(recordCellText({}, col)).toBe(EMPTY_CELL);
  });

  it('counts a nested array', () => {
    const col = { label: 'Adverse events', countOf: 'adverseEvents' };
    expect(recordCellText({ adverseEvents: ['a', 'b'] }, col)).toBe('2');
    // A record seeded before the array existed still reads as zero, not "—".
    expect(recordCellText({}, col)).toBe('0');
  });

  it('joins a paired column as "a / b", em-dashing each half independently', () => {
    const col = { label: 'Cycle / Day#', path: 'timelog.cycle', pairWith: 'timelog.dayNum' };
    expect(recordCellText({ timelog: { cycle: '2', dayNum: '1' } }, col)).toBe('2 / 1');
    expect(recordCellText({ timelog: { cycle: '2' } }, col)).toBe('2 / —');
    expect(recordCellText({}, col)).toBe('— / —');
  });

  it('renders booleans as Yes/No rather than true/false', () => {
    expect(recordCellText({ given: true }, { label: 'Given', path: 'given' })).toBe('Yes');
    expect(recordCellText({ given: false }, { label: 'Given', path: 'given' })).toBe('No');
  });

  it('renders numeric zero rather than treating it as empty', () => {
    expect(recordCellText({ dose: 0 }, { label: 'Dose', path: 'dose' })).toBe('0');
  });
});

describe('recordCountText', () => {
  it('substitutes {n} and pluralises {s}', () => {
    const t = '{n} treatment day{s} logged this month';
    expect(recordCountText(t, 0)).toBe('0 treatment days logged this month');
    expect(recordCountText(t, 1)).toBe('1 treatment day logged this month');
    expect(recordCountText(t, 3)).toBe('3 treatment days logged this month');
  });

  it('falls back to a generic count when no template is configured', () => {
    expect(recordCountText(undefined, 1)).toBe('1 record');
    expect(recordCountText(undefined, 2)).toBe('2 records');
  });
});

describe('createRecordDefault', () => {
  it('seeds nested objects and empty arrays so summary paths resolve immediately', () => {
    const seeded = createRecordDefault({
      type: 'object',
      properties: {
        date: { type: 'string' },
        timelog: {
          type: 'object',
          properties: { cycle: { type: 'string' }, dayNum: { type: 'string' } },
        },
        adverseEvents: { type: 'array' },
      },
    });

    expect(seeded.timelog).toEqual({});
    expect(seeded.adverseEvents).toEqual([]);
    // A plain string property is left absent rather than seeded to '' — an
    // untouched field must stay undefined so `required` validation still bites.
    expect('date' in seeded).toBe(false);
  });

  it('honours an explicit schema default', () => {
    const seeded = createRecordDefault({
      type: 'object',
      properties: { status: { type: 'string', default: 'PLANNED' } },
    });
    expect(seeded.status).toBe('PLANNED');
  });

  it('returns an empty record for a missing schema', () => {
    expect(createRecordDefault(undefined)).toEqual({});
  });
});

describe('isColumnEditable', () => {
  it('allows a column that names one concrete field', () => {
    expect(isColumnEditable({ label: 'Date', path: 'date' })).toBe(true);
  });

  it('refuses derived columns, which have no single value to write back', () => {
    expect(isColumnEditable({ label: 'Drugs', countOf: 'drugs' })).toBe(false);
    expect(isColumnEditable({ label: 'Start / Finish', path: 'a', pairWith: 'b' })).toBe(false);
    expect(isColumnEditable({ label: 'Nothing' })).toBe(false);
  });
});

describe('fieldsOutsideColumns', () => {
  const schema = {
    type: 'object',
    properties: { day: {}, date: {}, grbs: {}, nurse: {} },
  } as never;

  it('lists the fields a detail panel would need to show', () => {
    expect(fieldsOutsideColumns(schema, [{ label: 'Day', path: 'day' }])).toEqual([
      'date',
      'grbs',
      'nurse',
    ]);
  });

  it('returns nothing when every field is already a column — no panel needed', () => {
    const columns = [
      { label: 'Day', path: 'day' },
      { label: 'Date', path: 'date' },
      { label: 'GRBS', path: 'grbs' },
      { label: 'Nurse', path: 'nurse' },
    ];
    expect(fieldsOutsideColumns(schema, columns)).toEqual([]);
  });

  it('counts fields referenced by pairWith and countOf as shown', () => {
    const paired = [{ label: 'Day / Date', path: 'day', pairWith: 'date' }];
    expect(fieldsOutsideColumns(schema, paired)).toEqual(['grbs', 'nurse']);
  });
});

