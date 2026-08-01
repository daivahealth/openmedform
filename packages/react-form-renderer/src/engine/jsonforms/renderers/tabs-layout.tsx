/**
 * `OmfTabsLayout` — a tab strip over its child elements.
 *
 * Each child is one tab page, titled by that child's own `label`. Used mainly as
 * the `options.detail` of a `recordTable`, where a single record can carry ~100
 * fields across eight clinical stages (order details → vascular access →
 * treatment orders → time log → drug administration → monitoring → discharge →
 * adverse events). Source forms group those behind a tab bar; one long scroll
 * would be unusable at the bedside.
 *
 * Inactive pages are unmounted rather than hidden, so a large record does not
 * pay the layout cost of every tab on every keystroke — the same reason the
 * Angular renderer uses OnPush containers.
 */

import { useState, type ComponentType } from 'react';
import type { LayoutProps, Layout, UISchemaElement } from '@jsonforms/core';
import { rankWith, uiTypeIs } from '@jsonforms/core';
import { withJsonFormsLayoutProps, JsonFormsDispatch } from '@jsonforms/react';

const BORDER = 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)';

function tabTitle(element: UISchemaElement, index: number): string {
  const label = (element as { label?: string | boolean }).label;
  return typeof label === 'string' && label.trim() ? label : `Section ${index + 1}`;
}

function OmfTabsLayout(props: LayoutProps) {
  const { uischema, schema, path, visible, enabled, renderers, cells } = props;
  const [active, setActive] = useState(0);

  if (!visible) return null;

  const pages = ((uischema as Layout).elements ?? []) as UISchemaElement[];
  if (pages.length === 0) return null;

  const current = Math.min(active, pages.length - 1);

  return (
    <div className="omf-tabs">
      <div
        role="tablist"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          borderBottom: BORDER,
          marginBottom: 'var(--omf-section-gap, 16px)',
        }}
      >
        {pages.map((page, index) => {
          const isActive = index === current;
          return (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(index)}
              style={{
                appearance: 'none',
                border: 'none',
                background: 'transparent',
                padding: '8px 14px',
                cursor: 'pointer',
                fontSize: 'var(--omf-font-size-body, 14px)',
                fontWeight: isActive ? 700 : 500,
                color: isActive
                  ? 'var(--omf-color-accent, #4a2d5c)'
                  : 'var(--omf-color-label, #3a4552)',
                borderBottom: isActive
                  ? '2px solid var(--omf-color-accent, #4a2d5c)'
                  : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {tabTitle(page, index)}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {/* The active page only — see the note on unmounting above. The page's
            own label is already the tab title, so suppress it to avoid a
            heading that repeats the tab the user just clicked. */}
        <JsonFormsDispatch
          uischema={{ ...pages[current], label: false } as UISchemaElement}
          schema={schema}
          path={path}
          enabled={enabled}
          renderers={renderers}
          cells={cells}
        />
      </div>
    </div>
  );
}

export const omfTabsTester = rankWith(20, uiTypeIs('OmfTabsLayout'));
export const OmfTabsLayoutControl: ComponentType<any> = withJsonFormsLayoutProps(OmfTabsLayout);
