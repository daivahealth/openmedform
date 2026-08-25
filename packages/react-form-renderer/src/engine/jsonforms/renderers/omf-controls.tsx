/**
 * omf-aware standard controls — textarea and radio — selected via
 * `options.omf.control`. These demonstrate the extension mechanism: stock
 * JSON Forms would render a string as a single-line input and an enum as a
 * select; the omf bag lets a form author opt into a multiline area or an inline
 * radio group without leaving the JSON Forms vocabulary.
 */

import { useMemo, type ComponentType } from 'react';
import type { ControlProps, LayoutProps, GroupLayout, Layout, UISchemaElement } from '@jsonforms/core';
import {
  rankWith,
  isBooleanControl,
  uiTypeIs,
  and,
  or,
  not,
  isStringControl,
  isNumberControl,
  isIntegerControl,
  isDateControl,
  isEnumControl,
  isOneOfEnumControl,
  schemaMatches,
} from '@jsonforms/core';
import {
  withJsonFormsControlProps,
  withJsonFormsLayoutProps,
  JsonFormsDispatch,
  useJsonForms,
} from '@jsonforms/react';
import type { UiRule } from '@openmedform/form-schema-types';
import {
  collectScoreItems,
  showsSectionSubtotal,
  computeScore,
  filterVisibleElements,
  resolveEnumOptions,
  resolveMultiEnumOptions,
} from '@openmedform/form-core';
import { FieldFrame, inputStyle } from './field-frame';
import { OMF_CONTROL_RANK, omfControlIs, readOmf } from '../testers';

// --- point-value colour coding (shared) -------------------------------------
// Mirrors the paper legend where each point value has its own colour. Used by
// scored checkbox badges and section-header legend chips. Kept in sync with the
// Angular renderer's palette so both frameworks look identical.

interface PointStyle {
  fg: string;
  bg: string;
}

export function pointColor(points: number): PointStyle {
  if (points >= 5) return { fg: '#c0392b', bg: '#fdecea' }; // red
  if (points >= 3) return { fg: '#b8860b', bg: '#fbf3e0' }; // amber
  if (points >= 2) return { fg: '#1e8e5a', bg: '#e8f6ee' }; // green
  return { fg: '#2d6cdf', bg: '#e9f0fc' }; // blue (1 pt / default)
}

function PointBadge({ points }: { points: number }) {
  const c = pointColor(points);
  return (
    <span
      style={{
        flex: '0 0 auto',
        minWidth: 22,
        textAlign: 'center',
        padding: '1px 7px',
        borderRadius: 'var(--omf-border-radius, 4px)',
        border: `1px solid ${c.fg}`,
        background: c.bg,
        color: c.fg,
        fontSize: 'var(--omf-font-size-help, 12px)',
        fontWeight: 700,
        lineHeight: 1.6,
      }}
    >
      {points}
    </span>
  );
}

// --- textarea ---------------------------------------------------------------

function OmfTextarea(props: ControlProps) {
  const { id, label, data, enabled, visible, required, errors, path, handleChange, uischema } = props;
  if (!visible) return null;
  const rows = (readOmf(uischema)?.screen as { rows?: number } | undefined)?.rows ?? 3;
  return (
    <FieldFrame id={id} label={label} required={required} errors={errors}>
      <textarea
        id={id}
        value={(data as string) ?? ''}
        rows={rows}
        disabled={!enabled}
        style={{ ...inputStyle, resize: 'vertical' }}
        onChange={(e) => handleChange(path, e.target.value || undefined)}
      />
    </FieldFrame>
  );
}

export const omfTextareaTester = rankWith(OMF_CONTROL_RANK, omfControlIs('textarea'));
export const OmfTextareaControl: ComponentType<any> = withJsonFormsControlProps(OmfTextarea);

// --- radio ------------------------------------------------------------------

function OmfRadio(props: ControlProps) {
  const { id, label, data, enabled, visible, required, errors, path, handleChange, schema, uischema } = props;
  if (!visible) return null;
  // Codes are what we store; labels are what the clinician reads. Resolved in
  // form-core so the Angular renderer shows the same words.
  const options = resolveEnumOptions(schema, uischema);
  const screen = readOmf(uischema)?.screen as { inline?: boolean; labelPosition?: string } | undefined;
  // Label-left / options-right (paper YES–NO layout): explicit, or the default
  // for a two-option radio (overwhelmingly a YES/NO row on clinical forms).
  const labelLeft = screen?.labelPosition
    ? screen.labelPosition === 'left'
    : options.length === 2;
  const inline = screen?.inline ?? labelLeft;

  const optionEls = options.map((option) => (
    <label key={option.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--omf-font-size-body, 14px)' }}>
      <input
        type="radio"
        name={id}
        value={option.code}
        checked={data === option.code}
        disabled={!enabled}
        onChange={() => handleChange(path, option.code)}
      />
      {option.label}
    </label>
  ));

  if (labelLeft) {
    return (
      <div className="omf-field" style={{ marginBottom: 'var(--omf-field-gap, 12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              flex: '1 1 auto',
              fontSize: 'var(--omf-font-size-label, 13px)',
              fontWeight: 'var(--omf-label-weight, 600)' as never,
              color: 'var(--omf-color-label, #3a4552)',
            }}
          >
            {label}
            {required ? <span style={{ color: 'var(--omf-color-invalid, #c0392b)' }}> *</span> : null}
          </span>
          <div style={{ display: 'flex', gap: 16, flex: '0 0 auto' }}>{optionEls}</div>
        </div>
        {errors ? (
          <div style={{ fontSize: 'var(--omf-font-size-help, 12px)', color: 'var(--omf-color-invalid, #c0392b)' }}>{errors}</div>
        ) : null}
      </div>
    );
  }

  return (
    <FieldFrame id={id} label={label} required={required} errors={errors}>
      <div style={{ display: 'flex', flexDirection: inline ? 'row' : 'column', gap: inline ? 16 : 4, flexWrap: 'wrap' }}>
        {optionEls}
      </div>
    </FieldFrame>
  );
}

export const omfRadioTester = rankWith(OMF_CONTROL_RANK, omfControlIs('radio'));
export const OmfRadioControl: ComponentType<any> = withJsonFormsControlProps(OmfRadio);

// --- checkbox group (multi-select: array of enum/oneOf codes) ----------------

function OmfCheckboxGroup(props: ControlProps) {
  const { id, label, data, enabled, visible, required, errors, path, handleChange, schema, uischema } = props;
  if (!visible) return null;
  // Codes are what we store; labels are what the clinician reads. Resolved in
  // form-core so the Angular renderer shows the same words.
  const options = resolveMultiEnumOptions(schema, uischema);
  const selected = Array.isArray(data) ? (data as string[]) : [];
  const screen = readOmf(uischema)?.screen as { inline?: boolean } | undefined;
  const inline = screen?.inline ?? true;

  const toggle = (code: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(code);
    else next.delete(code);
    // Stored in schema order regardless of click order, so the same answers
    // always serialize identically.
    const value = options.filter((o) => next.has(o.code)).map((o) => o.code);
    handleChange(path, value.length ? value : undefined);
  };

  return (
    <FieldFrame id={id} label={label} required={required} errors={errors}>
      <div style={{ display: 'flex', flexDirection: inline ? 'row' : 'column', gap: inline ? 16 : 4, flexWrap: 'wrap' }}>
        {options.map((option) => (
          <label key={option.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--omf-font-size-body, 14px)' }}>
            <input
              type="checkbox"
              value={option.code}
              checked={selected.includes(option.code)}
              disabled={!enabled}
              onChange={(e) => toggle(option.code, e.target.checked)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </FieldFrame>
  );
}

/** An array whose items are enum/oneOf codes — a multi-select, not a list. */
const isMultiEnumArray = schemaMatches((s) => {
  if (s?.type !== 'array' || !s.items || Array.isArray(s.items)) return false;
  const items = s.items as { type?: string; enum?: unknown[]; oneOf?: unknown[] };
  return (
    (items.type === 'string' || items.type === 'number' || items.type === 'integer') &&
    (Array.isArray(items.enum) || Array.isArray(items.oneOf))
  );
});

// Rank ONE ABOVE the other omf controls on purpose: an enum-array wearing the
// wrong control name (the AI used to emit `checklistMatrix` for these) would
// otherwise reach the rows×columns matrix, which needs omf.rows/columns config
// and renders an empty grid without it. A real checklistMatrix stores a nested
// object, never an enum-array, so this never steals a configured matrix.
export const omfCheckboxGroupTester = rankWith(
  OMF_CONTROL_RANK + 1,
  or(omfControlIs('checkboxGroup'), isMultiEnumArray),
);
export const OmfCheckboxGroupControl: ComponentType<any> = withJsonFormsControlProps(OmfCheckboxGroup);

// --- default single-line input (bordered box — text/number/date/time) -------
// Ranked above the vanilla input (which renders a borderless faint line) but
// below the omf.control-specific renderers (textarea/radio, rank 20).

const OMF_INPUT_RANK = 5;

function inputType(schema: { type?: string | string[]; format?: string }): string {
  switch (schema.format) {
    case 'date':
      return 'date';
    case 'time':
      return 'time';
    case 'date-time':
      return 'datetime-local';
    case 'email':
      return 'email';
    default: {
      const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
      return t === 'number' || t === 'integer' ? 'number' : 'text';
    }
  }
}

function OmfInput(props: ControlProps) {
  const { id, label, data, enabled, visible, required, errors, path, handleChange, schema } = props;
  if (!visible) return null;
  const type = inputType(schema);
  return (
    <FieldFrame id={id} label={label} required={required} errors={errors}>
      <input
        id={id}
        type={type}
        value={(data as string | number | undefined) ?? ''}
        disabled={!enabled}
        style={inputStyle}
        onChange={(e) => {
          const raw = e.target.value;
          if (type === 'number') handleChange(path, raw === '' ? undefined : Number(raw));
          else handleChange(path, raw || undefined);
        }}
      />
    </FieldFrame>
  );
}

// A single-select must be excluded BOTH ways. `{ type: 'string', oneOf: [...] }`
// is a string control by `isStringControl` and carries no `enum` keyword, so
// without `not(isOneOfEnumControl)` this tester matches it at the same rank as
// the select — and being registered first, wins. The field then renders as an
// empty text box with the options nowhere in sight.
export const omfInputTester = rankWith(
  OMF_INPUT_RANK,
  and(
    or(isStringControl, isNumberControl, isIntegerControl, isDateControl),
    not(isEnumControl),
    not(isOneOfEnumControl),
  ),
);
export const OmfInputControl: ComponentType<any> = withJsonFormsControlProps(OmfInput);

// --- default enum select (bordered box) -------------------------------------

function OmfSelect(props: ControlProps) {
  const { id, label, data, enabled, visible, required, errors, path, handleChange, schema, uischema } = props;
  if (!visible) return null;
  const options = resolveEnumOptions(schema, uischema);
  return (
    <FieldFrame id={id} label={label} required={required} errors={errors}>
      <select
        id={id}
        value={(data as string) ?? ''}
        disabled={!enabled}
        style={inputStyle}
        onChange={(e) => handleChange(path, e.target.value || undefined)}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

// `isEnumControl` only matches a plain `enum`; a `oneOf` of consts is the other
// half of the same idea and would otherwise fall through to the vanilla select,
// which is exactly where labels get lost.
export const omfSelectTester = rankWith(OMF_INPUT_RANK, or(isEnumControl, isOneOfEnumControl));
export const OmfSelectControl: ComponentType<any> = withJsonFormsControlProps(OmfSelect);

// --- checkbox (box on the LEFT, then label — matches paper forms) -----------

function OmfCheckbox(props: ControlProps) {
  const { id, label, data, enabled, visible, required, errors, path, handleChange, uischema } = props;
  if (!visible) return null;
  const points = (readOmf(uischema)?.points as number | undefined);
  return (
    <div className="omf-field" style={{ marginBottom: 'var(--omf-field-gap, 12px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: '1 1 auto', fontSize: 'var(--omf-font-size-body, 14px)' }}>
          <input
            id={id}
            type="checkbox"
            checked={data === true}
            disabled={!enabled}
            onChange={(e) => handleChange(path, e.target.checked)}
          />
          <span>
            {label}
            {required ? <span style={{ color: 'var(--omf-color-invalid, #c0392b)' }}> *</span> : null}
          </span>
        </label>
        {typeof points === 'number' ? <PointBadge points={points} /> : null}
      </div>
      {errors ? (
        <div style={{ fontSize: 'var(--omf-font-size-help, 12px)', color: 'var(--omf-color-invalid, #c0392b)' }}>
          {errors}
        </div>
      ) : null}
    </div>
  );
}

// Wins over the vanilla boolean renderer for every boolean control.
export const omfCheckboxTester = rankWith(OMF_CONTROL_RANK, isBooleanControl);
export const OmfCheckboxControl: ComponentType<any> = withJsonFormsControlProps(OmfCheckbox);

// --- group (bordered box + shaded header band — matches paper sections) -----

function OmfGroup(props: LayoutProps) {
  const { uischema, schema, path, visible, enabled, renderers, cells } = props;
  const ctx = useJsonForms();
  const group = uischema as GroupLayout;
  const data = ctx.core?.data ?? {};

  // Live section subtotal: sum this box's own scored (omf.points) descendants
  // against the whole-form data — but only where a total belongs, which is the
  // innermost scoring section unless the definition says otherwise (see
  // showsSectionSubtotal). Memoized so the tree walk runs only when the schema
  // changes and the sum only when data changes — not on every JsonForms state
  // emission (validation/focus/…) that re-renders this component.
  const scoreItems = useMemo(
    () => (showsSectionSubtotal(group as never) ? collectScoreItems(group as never) : []),
    [group],
  );
  const subtotal = useMemo(
    () => (scoreItems.length ? computeScore(scoreItems, data).total : undefined),
    [scoreItems, data],
  );

  if (!visible) return null;
  const elements = group.elements ?? [];
  const omf = readOmf(uischema);
  const accent = typeof omf?.accentColor === 'string' ? (omf.accentColor as string) : undefined;
  const rawIcon = typeof omf?.icon === 'string' ? (omf.icon as string) : undefined;
  const legend = Array.isArray(omf?.pointLegend) ? (omf!.pointLegend as number[]) : undefined;
  const borderColor = accent ?? 'var(--omf-color-border, #c8cdd4)';
  // Avoid a double glyph when the AI also embedded the icon in the label text.
  const labelText = typeof group.label === 'string' ? group.label : '';
  const icon = rawIcon && !labelText.includes(rawIcon) ? rawIcon : undefined;
  const isSubsection = omf?.variant === 'subsection';

  const childNodes = elements.map((child, index) => (
    <JsonFormsDispatch
      key={index}
      uischema={child}
      schema={schema}
      path={path}
      enabled={enabled}
      renderers={renderers}
      cells={cells}
    />
  ));

  // Subsection: an indented heading + nested items, NO box — a heading-plus-list
  // inside a section (e.g. "Immobility … PLUS one or more of:" + its factors).
  if (isSubsection) {
    return (
      <div style={{ marginBottom: 'var(--omf-section-gap, 16px)' }}>
        {group.label ? (
          <div
            style={{
              fontWeight: 'var(--omf-label-weight, 600)' as never,
              fontSize: 'var(--omf-font-size-label, 13px)',
              color: 'var(--omf-color-label, #3a4552)',
              marginBottom: 'var(--omf-field-gap, 12px)',
            }}
          >
            {group.label}
          </div>
        ) : null}
        <div
          style={{
            marginLeft: 'var(--omf-subsection-indent, 20px)',
            borderLeft: `2px solid ${accent ?? 'var(--omf-color-border, #c8cdd4)'}`,
            paddingLeft: 'var(--omf-control-padding, 8px)',
          }}
        >
          {childNodes}
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        border: `var(--omf-border-width, 1px) solid ${borderColor}`,
        borderRadius: 'var(--omf-border-radius, 4px)',
        marginBottom: 'var(--omf-section-gap, 16px)',
        overflow: 'hidden',
      }}
    >
      {group.label ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--omf-color-section-bg, #f7f8fa)',
            borderBottom: `var(--omf-border-width, 1px) solid ${borderColor}`,
            padding: 'var(--omf-control-padding, 8px)',
            fontWeight: 'var(--omf-label-weight, 600)' as never,
            fontSize: 'var(--omf-font-size-label, 13px)',
            color: accent ?? 'var(--omf-color-label, #3a4552)',
          }}
        >
          {icon ? <span style={{ flex: '0 0 auto', fontSize: '1.1em', lineHeight: 1 }}>{icon}</span> : null}
          <span style={{ flex: '1 1 auto' }}>{group.label}</span>
          {legend?.length ? (
            <span style={{ display: 'inline-flex', gap: 4, flex: '0 0 auto' }}>
              {legend.map((p) => (
                <PointBadge key={p} points={p} />
              ))}
            </span>
          ) : null}
          {subtotal !== undefined ? (
            <span
              style={{
                flex: '0 0 auto',
                marginLeft: 4,
                padding: '1px 8px',
                borderRadius: 999,
                border: `1px solid ${accent ?? 'var(--omf-color-border, #c8cdd4)'}`,
                fontSize: 'var(--omf-font-size-help, 12px)',
                fontWeight: 700,
              }}
              title="Section subtotal"
            >
              Σ {subtotal}
            </span>
          ) : null}
        </div>
      ) : null}
      <div style={{ padding: 'var(--omf-control-padding, 8px)' }}>{childNodes}</div>
    </div>
  );
}

export const omfGroupTester = rankWith(OMF_CONTROL_RANK, uiTypeIs('Group'));
export const OmfGroupControl: ComponentType<any> = withJsonFormsLayoutProps(OmfGroup);

// --- label / static instruction text (line-break preserving) ----------------
//
// A JSON Forms `Label` element carries read-only text (instructions, footnotes,
// bulleted "on the day of treatment the patient must:" blocks). The vanilla
// LabelRenderer prints it inline, so newlines in the source collapse and a
// dash-bulleted list runs together on one line. We render the text in a block
// with `white-space: pre-line` so every `\n` in the source becomes a real line
// break — a bulleted list stays one item per line, matching the paper.

function OmfLabel(props: LayoutProps) {
  const { uischema, visible } = props;
  if (!visible) return null;
  const text = (uischema as { text?: string }).text ?? '';
  if (!text.trim()) return null;
  return (
    <div
      style={{
        whiteSpace: 'pre-line',
        fontSize: 'var(--omf-font-size-body, 14px)',
        color: 'var(--omf-color-label, #3a4552)',
        lineHeight: 1.6,
        marginBottom: 'var(--omf-field-gap, 12px)',
      }}
    >
      {text}
    </div>
  );
}

export const omfLabelTester = rankWith(OMF_CONTROL_RANK, uiTypeIs('Label'));
export const OmfLabelControl: ComponentType<any> = withJsonFormsLayoutProps(OmfLabel);

// --- horizontal layout (colSpan-aware row with gaps — no overlap) -----------

function childColSpan(child: UISchemaElement): number | undefined {
  return (child as { options?: { omf?: { screen?: { colSpan?: number } } } })?.options?.omf?.screen
    ?.colSpan;
}

function OmfHorizontalLayout(props: LayoutProps) {
  const { uischema, schema, path, visible, enabled, renderers, cells } = props;
  if (!visible) return null;
  const elements = (uischema as Layout).elements ?? [];
  const gap = 'var(--omf-control-gap, 12px)';
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap, alignItems: 'flex-start' }}>
      {elements.map((child, index) => {
        const colSpan = childColSpan(child);
        // colSpan is out of 12; subtract the gap so N columns fit on one row.
        const flex = colSpan
          ? `0 1 calc(${((colSpan / 12) * 100).toFixed(4)}% - ${gap})`
          : '1 1 0';
        return (
          <div key={index} style={{ flex, minWidth: 140, boxSizing: 'border-box' }}>
            <JsonFormsDispatch
              uischema={child}
              schema={schema}
              path={path}
              enabled={enabled}
              renderers={renderers}
              cells={cells}
            />
          </div>
        );
      })}
    </div>
  );
}

export const omfHorizontalTester = rankWith(OMF_CONTROL_RANK, uiTypeIs('HorizontalLayout'));
export const OmfHorizontalLayoutControl: ComponentType<any> =
  withJsonFormsLayoutProps(OmfHorizontalLayout);

// --- table layout (left label column + right field cells, bordered) --------
//
// For paper forms built as a grid where each row has a bold category label in a
// left column and its fields in a right column (e.g. Αλλεργίες | Latex …), the
// AI emits an `OmfTableLayout` whose `elements` are `OmfTableRow`s. Each row is
// { label, elements }. This renders a real bordered <table> so the left labels
// line up as a column and every row's borders align — matching the paper.

interface OmfTableRowShape {
  label?: string;
  elements?: UISchemaElement[];
  /**
   * A row may carry a JSON Forms rule of its own, so a table can reveal rows in
   * turn (CAM-ICU: assess Feature 2 only once Feature 1 is present). The row is
   * the layout here — it never passes through JsonFormsDispatch — so the rule
   * is evaluated below rather than by the framework.
   */
  rule?: UiRule;
}

interface OmfTableColumn {
  label?: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

function OmfTableLayout(props: LayoutProps) {
  const { uischema, schema, path, visible, enabled, renderers, cells } = props;
  // Row rules are evaluated against the whole response, not this layout's
  // scope, so read the core data the same way the scored controls do. Hooks
  // run before any early return.
  const ctx = useJsonForms();
  const data = ctx.core?.data ?? {};
  if (!visible) return null;
  const allRows = ((uischema as Layout).elements ?? []) as unknown as OmfTableRowShape[];
  const rows = filterVisibleElements(allRows, data, enabled !== false);
  const columns = readOmf(uischema)?.columns as OmfTableColumn[] | undefined;
  const border = 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)';
  const pad = 'var(--omf-control-padding, 8px)';
  const headerBg = 'var(--omf-color-section-bg, #f7f8fa)';
  const labelStyle = {
    fontWeight: 'var(--omf-label-weight, 600)' as never,
    fontSize: 'var(--omf-font-size-label, 13px)',
    color: 'var(--omf-color-label, #3a4552)',
  };

  const dispatch = (
    child: UISchemaElement,
    key: number,
    stripLabel: boolean,
    rowEnabled: boolean,
  ) => (
    <JsonFormsDispatch
      key={key}
      // In column mode the header names the field, so suppress the control's
      // own label — otherwise every cell repeats "Name", "Signature", "Date".
      // Done here rather than relying on the schema so it holds even when the
      // generated UI schema omits `label: false`. (A Label element renders from
      // `text`, so this is a no-op for static text cells.)
      uischema={stripLabel ? ({ ...child, label: false } as UISchemaElement) : child}
      schema={schema}
      path={path}
      enabled={rowEnabled}
      renderers={renderers}
      cells={cells}
    />
  );

  // Column mode: a real grid mirroring the source table's <thead>/<tbody>, with
  // one cell per child. Falls back to the two-cell (row label | contents)
  // layout when no columns are declared.
  const hasColumns = Array.isArray(columns) && columns.length > 0;

  return (
    <div
      className="omf-scroll-x"
      style={{ overflowX: 'auto', marginBottom: 'var(--omf-section-gap, 16px)' }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: hasColumns ? 'auto' : 'fixed',
        }}
      >
        {hasColumns ? (
          <thead>
            <tr>
              {columns!.map((col, c) => (
                <th
                  key={c}
                  scope="col"
                  style={{
                    ...labelStyle,
                    border,
                    background: headerBg,
                    padding: pad,
                    textAlign: col.align ?? 'left',
                    width: col.width,
                    // Without a floor, an auto-layout table collapses columns
                    // whose header is short (Name, Signature) to the input's
                    // intrinsic width. Explicit widths still win.
                    minWidth: col.width ? undefined : 'var(--omf-table-col-min, 130px)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.label ?? ''}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map(({ element: row, index: r, enabled: rowEnabled }) => (
            <tr key={r}>
              {hasColumns ? (
                <>
                  {/* A row `label` occupies the first column when present, so a
                      grid whose first column is a static row header still
                      lines up with its <th>. */}
                  {row.label !== undefined ? (
                    <td style={{ ...labelStyle, border, padding: pad, verticalAlign: 'middle' }}>
                      {row.label}
                    </td>
                  ) : null}
                  {(row.elements ?? []).map((child, index) => (
                    <td
                      key={index}
                      // omf-table-cell drops the field's bottom margin so rows
                      // stay as tight as the source table (see scoped CSS in
                      // JsonFormsRenderer).
                      className="omf-table-cell"
                      style={{
                        border,
                        padding: pad,
                        verticalAlign: 'middle',
                        textAlign: columns![index + (row.label !== undefined ? 1 : 0)]?.align ?? 'left',
                      }}
                    >
                      {dispatch(child, index, true, rowEnabled)}
                    </td>
                  ))}
                </>
              ) : (
                <>
                  <td
                    style={{
                      ...labelStyle,
                      border,
                      background: headerBg,
                      width: 'var(--omf-table-label-width, 16%)',
                      verticalAlign: 'top',
                      padding: pad,
                    }}
                  >
                    {row.label}
                  </td>
                  <td style={{ border, verticalAlign: 'top', padding: pad }}>
                    {(row.elements ?? []).map((child, index) =>
                      dispatch(child, index, false, rowEnabled),
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const omfTableTester = rankWith(OMF_CONTROL_RANK, uiTypeIs('OmfTableLayout'));
export const OmfTableLayoutControl: ComponentType<any> = withJsonFormsLayoutProps(OmfTableLayout);
