# @openmedform/form-schema-types

## 0.5.0

### Minor Changes

- b74ba2d: Render source tables as real grids, and add table support to the Angular renderer.

  `OmfTableLayout` gains `options.omf.columns` (`{ label, width, align }[]`). With
  columns declared it renders a true grid — a header row plus ONE cell per child,
  aligned to the columns — instead of the previous two-cell (row label | all
  contents) layout that stacked and wrapped every field. Cell controls no longer
  repeat their own label, since the column header already names them. Column
  widths and alignment carry over from the source, and a wide table scrolls inside
  its own container rather than pushing the host page sideways. Omitting `columns`
  keeps the existing left-label behaviour unchanged.

  The Angular renderer previously had **no** `OmfTableLayout` renderer at all, so
  any form containing a table fell through to "No applicable renderer found!".
  It now implements the same two modes as React.

## 0.4.1

## 0.4.0

## 0.3.0

### Minor Changes

- 499b0bc: Add colour-coded, icon-headed scored clinical checklists to the jsonforms engine.

  - New `options.omf` extensions: `accentColor`, `icon`, `points`, `pointLegend`,
    and scoreSummary `bands` for risk stratification.
  - `@openmedform/form-core` gains a framework-independent scoring module
    (`collectScoreItems` / `computeScore` / `stratify` / `scoreUiSchema`) — the
    single source of truth for the live on-screen total and the server's
    authoritative recomputation.
  - The React and Angular renderers draw colour-coded point badges, per-section
    subtotals, and a live `scoreSummary` (grand total + risk band).
  - Radio controls support `options.omf.screen.labelPosition: "left"` for
    label-left / options-right YES/NO rows (the default for a two-option radio).
  - Section headers de-duplicate the icon glyph when the label already embeds it.
  - New `options.omf.variant: "subsection"` on Group — an indented sub-heading with
    nested items (no box) that preserves heading-plus-indented-list hierarchy.

## 0.2.0
