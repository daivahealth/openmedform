/**
 * `recordTable` — a repeating encounter log.
 *
 * Clinical forms very often carry a table the user ADDS ROWS TO, where the table
 * itself is only a summary and the real form lives behind each row: a treatment
 * day, a medication round, an observation entry. On paper it is a ruled grid; in
 * an HTML mock-up it is a `<thead>` with an empty `<tbody>` plus an
 * "+ Add <thing>" button, filled in by script.
 *
 * Stock JSON Forms renders an array of objects as its generic list widget
 * ("Add to X / Items / Valid / No data"), which looks nothing like the source
 * and buries the fields. This control instead renders:
 *
 *   toolbar   "3 treatment days logged this month"      [+ Add treatment day]
 *   table     Day | Date | Cycle/Day# | … | (Open/Close)
 *   detail    the selected row expands INLINE beneath itself, spanning the full
 *             table width, with a Close button — usually an OmfTabsLayout.
 *
 * Only one row is expanded at a time, mirroring the source behaviour and keeping
 * a ~100-field record from swamping the page.
 */

import { useCallback, useMemo, useState, type ComponentType, type CSSProperties } from 'react';
import type { ArrayLayoutProps, UISchemaElement } from '@jsonforms/core';
import {
  rankWith,
  composePaths,
  findUISchema,
  Generate,
  Resolve,
  and,
  uiTypeIs,
  schemaMatches,
  or,
} from '@jsonforms/core';
import { withJsonFormsArrayLayoutProps, JsonFormsDispatch, useJsonForms } from '@jsonforms/react';
import {
  createRecordDefault,
  deriveRecordColumns,
  fieldsOutsideColumns,
  isColumnEditable,
  recordCellText,
  recordCountText,
  type RecordTableColumn,
  type RecordTableConfig,
} from '@openmedform/form-core';
import { OMF_CONTROL_RANK, omfControlIs, readOmf } from '../testers';

// Summary-cell derivation, record seeding and the count line all come from
// form-core so the Angular control behaves identically — see
// packages/form-core/src/record-table/summary.ts for why that matters.

const BORDER = 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)';
const PAD = 'var(--omf-control-padding, 8px)';

/**
 * The actions column is pinned to the right edge.
 *
 * A converted chart can easily run to ten columns and scroll horizontally. When
 * Open/remove scroll out of view with it, a row becomes not just hard to edit
 * but impossible to delete — there is no other affordance. Pinning keeps them
 * on screen at any width.
 */
const STICKY_ACTIONS: CSSProperties = {
  position: 'sticky',
  right: 0,
  zIndex: 1,
  background: 'var(--omf-color-surface, #fff)',
  boxShadow: 'inset 1px 0 0 var(--omf-color-border, #c8cdd4)',
};

function RecordTable(props: ArrayLayoutProps) {
  const {
    uischema,
    schema,
    path,
    visible,
    enabled,
    renderers,
    cells,
    addItem,
    removeItems,
    data,
    label,
    rootSchema,
    uischemas,
  } = props;

  const ctx = useJsonForms();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const cfg = (readOmf(uischema)?.recordTable ?? {}) as RecordTableConfig;
  // An array the author never configured still gets a usable table rather than
  // the stock list widget — see deriveRecordColumns.
  const columns = useMemo(
    () => (cfg.columns?.length ? cfg.columns : deriveRecordColumns(schema as never)),
    [cfg.columns, schema],
  );

  // `data` on an array layout is the COUNT, not the array; the records
  // themselves have to be resolved out of the form context by path.
  const records = useMemo(() => {
    const value = Resolve.data(ctx.core?.data, path);
    return Array.isArray(value) ? value : [];
  }, [ctx.core?.data, path]);

  const count = typeof data === 'number' ? data : records.length;

  // The per-record UI schema: `options.detail` when the author supplied one,
  // otherwise a generated layout so the control degrades rather than blanks.
  const detailUiSchema = useMemo(
    () =>
      findUISchema(
        uischemas ?? [],
        schema,
        uischema.scope,
        path,
        () => Generate.uiSchema(schema, 'VerticalLayout') as UISchemaElement,
        uischema,
        rootSchema,
      ),
    [uischemas, schema, uischema, path, rootSchema],
  );

  // With every field already a column there is nothing left for a panel to
  // show, so the Open button is hidden rather than revealing an empty box.
  const hasDetail = useMemo(
    () => fieldsOutsideColumns(schema as never, columns).length > 0,
    [schema, columns],
  );

  /**
   * The live control for one editable cell.
   *
   * Dispatching a real Control at `records.<i>.<path>` reuses every existing
   * renderer — date picker, select, number — so an inline cell behaves exactly
   * like the same field in the detail panel, and writes to the same place. The
   * label is suppressed because the column header already names it.
   */
  const cellControl = useCallback(
    (index: number, col: RecordTableColumn) => (
      <JsonFormsDispatch
        schema={schema}
        uischema={
          {
            type: 'Control',
            scope: `#/properties/${(col.path ?? '').split('.').join('/properties/')}`,
            label: false,
          } as UISchemaElement
        }
        path={composePaths(path, String(index))}
        enabled={enabled}
        renderers={renderers}
        cells={cells}
      />
    ),
    [schema, path, enabled, renderers, cells],
  );

  const handleAdd = useCallback(() => {
    addItem(path, createRecordDefault(schema))();
    // The new record is appended, so it is the one to open.
    setOpenIndex(count);
  }, [addItem, path, schema, count]);

  const handleRemove = useCallback(
    (index: number) => {
      if (cfg.removeConfirm && !window.confirm(cfg.removeConfirm)) return;
      removeItems?.(path, [index])();
      setOpenIndex((current) => {
        if (current === null) return null;
        if (current === index) return null;
        return current > index ? current - 1 : current;
      });
    },
    [cfg.removeConfirm, removeItems, path],
  );

  if (!visible) return null;

  const colCount = columns.length + 1;
  const byColumn = cfg.orientation === 'columns';

  return (
    <div className="omf-record-table" style={{ marginBottom: 'var(--omf-section-gap, 16px)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--omf-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
            fontSize: 'var(--omf-font-size-label, 13px)',
            color: 'var(--omf-color-label, #3a4552)',
          }}
        >
          {recordCountText(cfg.countLabel, count)}
        </span>
        <button
          type="button"
          className="omf-record-add"
          onClick={handleAdd}
          disabled={enabled === false}
          style={{
            padding: '8px 16px',
            border: BORDER,
            borderRadius: 'var(--omf-border-radius, 4px)',
            background: 'var(--omf-color-accent, #4a2d5c)',
            color: '#fff',
            fontWeight: 600,
            fontSize: 'var(--omf-font-size-body, 14px)',
            cursor: enabled === false ? 'not-allowed' : 'pointer',
          }}
        >
          {cfg.addLabel ?? `+ Add ${typeof label === 'string' && label ? label : 'record'}`}
        </button>
      </div>

      <div className="omf-scroll-x" style={{ overflowX: 'auto' }}>
        {byColumn ? (
          <ColumnOrientedTable
            instanceLabel={cfg.instanceLabel}
            columns={columns}
            records={records}
            count={count}
            emptyLabel={cfg.emptyLabel}
            openIndex={openIndex}
            enabled={enabled !== false}
            onToggle={(i) => setOpenIndex(openIndex === i ? null : i)}
            onRemove={handleRemove}
            detail={(index) => (
              <JsonFormsDispatch
                schema={schema}
                uischema={detailUiSchema}
                path={composePaths(path, String(index))}
                enabled={enabled}
                renderers={renderers}
                cells={cells}
              />
            )}
          />
        ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  style={{
                    border: BORDER,
                    padding: PAD,
                    width: col.width,
                    textAlign: col.align ?? 'left',
                    background: 'var(--omf-color-header-bg, #4a2d5c)',
                    color: 'var(--omf-color-header-fg, #fff)',
                    fontSize: 'var(--omf-font-size-label, 13px)',
                    textTransform: 'uppercase',
                    letterSpacing: '.4px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.label}
                </th>
              ))}
              <th
                style={{
                  border: BORDER,
                  padding: PAD,
                  background: 'var(--omf-color-header-bg, #4a2d5c)',
                  width: '1%',
                }}
              />
            </tr>
          </thead>
          <tbody>
            {count === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  style={{
                    border: BORDER,
                    padding: 'calc(var(--omf-control-padding, 8px) * 2)',
                    textAlign: 'center',
                    fontStyle: 'italic',
                    color: 'var(--omf-color-muted, #6b7280)',
                  }}
                >
                  {cfg.emptyLabel ?? 'No records yet.'}
                </td>
              </tr>
            )}
            {Array.from({ length: count }).map((_, index) => {
              const record = records[index];
              const isOpen = openIndex === index;
              return (
                <RecordRow
                  key={index}
                  index={index}
                  isOpen={isOpen}
                  record={record}
                  columns={columns}
                  colCount={colCount}
                  onToggle={() => setOpenIndex(isOpen ? null : index)}
                  onRemove={() => handleRemove(index)}
                  enabled={enabled !== false}
                  cellControl={cellControl}
                  hasDetail={hasDetail}
                >
                  <JsonFormsDispatch
                    schema={schema}
                    uischema={detailUiSchema}
                    path={composePaths(path, String(index))}
                    enabled={enabled}
                    renderers={renderers}
                    cells={cells}
                  />
                </RecordRow>
              );
            })}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}

interface ColumnOrientedProps {
  instanceLabel?: string;
  columns: RecordTableColumn[];
  records: unknown[];
  count: number;
  emptyLabel?: string;
  openIndex: number | null;
  enabled: boolean;
  onToggle: (index: number) => void;
  onRemove: (index: number) => void;
  detail: (index: number) => React.ReactNode;
}

/**
 * Records as COLUMNS: field labels down the left, one column per record.
 *
 * This is how paper charts that compare instances side by side are drawn — a
 * cannula chart puts "Date of Insertion", "Site", "Gauge" down the side and
 * gives each cannula its own column. Rendering it the same way means a nurse
 * reads the screen exactly as they read the sheet.
 *
 * The data is identical to the row-oriented form; only the axes swap. The
 * expanded detail panel spans the full width beneath, as it does in row mode,
 * because a record's full field set never fits inside one column.
 */
function ColumnOrientedTable({
  instanceLabel,
  columns,
  records,
  count,
  emptyLabel,
  openIndex,
  enabled,
  onToggle,
  onRemove,
  detail,
}: ColumnOrientedProps) {
  if (count === 0) {
    return (
      <p
        style={{
          border: BORDER,
          padding: 'calc(var(--omf-control-padding, 8px) * 2)',
          textAlign: 'center',
          fontStyle: 'italic',
          color: 'var(--omf-color-muted, #6b7280)',
          margin: 0,
        }}
      >
        {emptyLabel ?? 'No records yet.'}
      </p>
    );
  }

  const headerCell: React.CSSProperties = {
    border: BORDER,
    padding: PAD,
    background: 'var(--omf-color-header-bg, #4a2d5c)',
    color: 'var(--omf-color-header-fg, #fff)',
    fontSize: 'var(--omf-font-size-label, 13px)',
    textTransform: 'uppercase',
    letterSpacing: '.4px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...headerCell, minWidth: 170 }}>Parameter</th>
          {Array.from({ length: count }).map((_, index) => (
            <th key={index} style={headerCell}>
              {`${instanceLabel ?? 'Record'} ${index + 1}`}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {columns.map((col, r) => (
          <tr key={r}>
            <td
              style={{
                border: BORDER,
                padding: PAD,
                background: 'var(--omf-color-section-bg, #f7f8fa)',
                fontWeight: 'var(--omf-label-weight, 600)' as never,
                fontSize: 'var(--omf-font-size-label, 13px)',
                color: 'var(--omf-color-label, #3a4552)',
                whiteSpace: 'nowrap',
              }}
            >
              {col.label}
            </td>
            {Array.from({ length: count }).map((_, index) => (
              <td
                key={index}
                style={{
                  border: BORDER,
                  padding: PAD,
                  textAlign: col.align ?? 'left',
                  fontSize: 'var(--omf-font-size-body, 14px)',
                  background:
                    openIndex === index ? 'var(--omf-color-section-bg, #f0eaf4)' : undefined,
                }}
              >
                {recordCellText(records[index], col)}
              </td>
            ))}
          </tr>
        ))}
        <tr>
          <td style={{ border: BORDER, padding: PAD }} />
          {Array.from({ length: count }).map((_, index) => (
            <td key={index} style={{ border: BORDER, padding: PAD, whiteSpace: 'nowrap' }}>
              <button
                type="button"
                className="omf-record-toggle"
                onClick={() => onToggle(index)}
                aria-expanded={openIndex === index}
                style={{
                  padding: '4px 12px',
                  border: BORDER,
                  borderRadius: 'var(--omf-border-radius, 4px)',
                  background: 'transparent',
                  color: 'var(--omf-color-accent, #4a2d5c)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {openIndex === index ? 'Close' : 'Open'}
              </button>
              {enabled && (
                <button
                  type="button"
                  className="omf-record-remove"
                  onClick={() => onRemove(index)}
                  aria-label={`Remove record ${index + 1}`}
                  style={{
                    marginLeft: 6,
                    padding: '4px 10px',
                    border: BORDER,
                    borderRadius: 'var(--omf-border-radius, 4px)',
                    background: 'transparent',
                    color: 'var(--omf-color-danger, #a3312a)',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </td>
          ))}
        </tr>
        {openIndex !== null && openIndex < count && (
          <tr>
            <td
              colSpan={count + 1}
              className="omf-record-detail"
              style={{ border: BORDER, padding: PAD, background: '#fff' }}
            >
              {detail(openIndex)}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

interface RecordRowProps {
  index: number;
  isOpen: boolean;
  record: unknown;
  columns: RecordTableColumn[];
  colCount: number;
  enabled: boolean;
  /** Renders the live control for an editable column's field. */
  cellControl: (index: number, col: RecordTableColumn) => React.ReactNode;
  /** False when every field is already a column, so a panel would be empty. */
  hasDetail: boolean;
  onToggle: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}

function RecordRow({
  index,
  isOpen,
  record,
  columns,
  colCount,
  enabled,
  cellControl,
  hasDetail,
  onToggle,
  onRemove,
  children,
}: RecordRowProps) {
  return (
    <>
      <tr
        style={{
          background: isOpen ? 'var(--omf-color-section-bg, #f0eaf4)' : undefined,
        }}
      >
        {columns.map((col, i) => (
          <td
            key={i}
            style={{
              border: BORDER,
              padding: PAD,
              textAlign: col.align ?? 'left',
              fontSize: 'var(--omf-font-size-body, 14px)',
            }}
          >
            {/* A column naming one field is edited in place, exactly as the
                source grid does. Derived columns (a nested-array count, a
                paired "A / B") have no single value to write, so they stay
                read-only text. */}
            {isColumnEditable(col) ? cellControl(index, col) : recordCellText(record, col)}
          </td>
        ))}
        <td style={{ ...STICKY_ACTIONS, border: BORDER, padding: PAD, whiteSpace: 'nowrap' }}>
          {hasDetail && (
          <button
            type="button"
            className="omf-record-toggle"
            onClick={onToggle}
            style={{
              padding: '4px 12px',
              border: BORDER,
              borderRadius: 'var(--omf-border-radius, 4px)',
              background: 'transparent',
              color: 'var(--omf-color-accent, #4a2d5c)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            aria-expanded={isOpen}
          >
            {isOpen ? 'Close' : 'Open'}
          </button>
          )}
          {enabled && (
            <button
              type="button"
              className="omf-record-remove"
              onClick={onRemove}
              title="Remove this record"
              aria-label={`Remove record ${index + 1}`}
              style={{
                marginLeft: 6,
                padding: '4px 10px',
                border: BORDER,
                borderRadius: 'var(--omf-border-radius, 4px)',
                background: 'transparent',
                color: 'var(--omf-color-danger, #a3312a)',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={colCount} style={{ border: BORDER, padding: PAD, background: '#fff' }}>
            {children}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Matches an explicit `recordTable`, and ALSO any array-of-objects control that
 * carries no omf config at all.
 *
 * The second half is the safety net: without it such an array falls through to
 * `@jsonforms/vanilla-renderers`' generic list ("Add to X / Items / Valid / No
 * data"), which is unusable on a clinical form. A generated table is imperfect;
 * that widget is broken.
 */
const isObjectArrayControl = and(
  uiTypeIs('Control'),
  schemaMatches(
    (s) =>
      s?.type === 'array' &&
      !!s.items &&
      !Array.isArray(s.items) &&
      (s.items as { type?: string }).type === 'object',
  ),
);

export const recordTableTester = rankWith(
  OMF_CONTROL_RANK,
  or(omfControlIs('recordTable'), isObjectArrayControl),
);
export const RecordTableControl: ComponentType<any> = withJsonFormsArrayLayoutProps(RecordTable);
