/**
 * Shared field frame — label + control slot + error line, styled with the
 * cross-framework design tokens (`--omf-*`). Every custom control renders
 * through this so React output stays visually consistent with the (future)
 * Angular renderer, which frames fields with the same tokens.
 */

import type { ReactNode } from 'react';

export interface FieldFrameProps {
  id?: string;
  label?: string;
  required?: boolean;
  errors?: string;
  children: ReactNode;
}

export function FieldFrame({ id, label, required, errors, children }: FieldFrameProps) {
  return (
    <div
      className="omf-field"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        marginBottom: 'var(--omf-field-gap, 12px)',
      }}
    >
      {label ? (
        <label
          htmlFor={id}
          style={{
            fontSize: 'var(--omf-font-size-label, 13px)',
            fontWeight: 'var(--omf-label-weight, 600)' as never,
            color: 'var(--omf-color-label, #3a4552)',
          }}
        >
          {label}
          {required ? <span style={{ color: 'var(--omf-color-invalid, #c0392b)' }}> *</span> : null}
        </label>
      ) : null}
      {children}
      {errors ? (
        <span style={{ fontSize: 'var(--omf-font-size-help, 12px)', color: 'var(--omf-color-invalid, #c0392b)' }}>
          {errors}
        </span>
      ) : null}
    </div>
  );
}

/** Shared input styling for text-like controls. */
export const inputStyle: React.CSSProperties = {
  fontSize: 'var(--omf-font-size-body, 14px)',
  padding: 'var(--omf-control-padding, 8px)',
  border: 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)',
  borderRadius: 'var(--omf-border-radius, 4px)',
  minHeight: 'var(--omf-row-min-height, 36px)',
  width: '100%',
  boxSizing: 'border-box',
};
