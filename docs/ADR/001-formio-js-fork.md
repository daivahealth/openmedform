# ADR-001: Fork formio.js for Form Engine

## Status
Accepted

## Context
We need a form builder that supports complex clinical assessment forms with scoring matrices, color-coded grids, conditional logic, calculated totals, and reference tables. Survey tools (Formbricks, Heyform) cannot handle these layouts. The Form.io server uses MongoDB and OSL-3.0 license.

## Decision
Fork the MIT-licensed `formio.js` (builder + renderer) and `@formio/react` (React bindings). Build our own backend on NestJS + PostgreSQL instead of using the Form.io server.

## Consequences
- **Positive:** Full ownership of the form engine. MIT license allows any modification. No MongoDB dependency. Backend matches our stack (NestJS + Prisma + PostgreSQL).
- **Negative:** We own the maintenance burden of the forked formio.js codebase. Upstream updates require manual cherry-picking.
- **Mitigation:** Keep fork changes minimal and isolated to `src/components/clinical/` where possible, making upstream merges easier.
