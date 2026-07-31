---
"@openmedform/form-schema-types": minor
"@openmedform/react-form-renderer": minor
"@openmedform/angular-form-renderer": minor
---

Render source tables as real grids, and add table support to the Angular renderer.

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
