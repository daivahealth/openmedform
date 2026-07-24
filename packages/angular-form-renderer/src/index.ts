/**
 * @openmedform/angular-form-renderer
 *
 * Angular (standalone) JSON Forms engine renderer. Drop <omf-form
 * [definition]="def"> into any standalone Angular app; it renders the same
 * jsonforms FormDefinition the React renderer does, using shared form-core
 * validation and form-design-tokens for cross-framework parity.
 */

export { OmfFormComponent } from './omf-form.component';
export {
  angularRenderers,
  standardRenderers,
  omfRenderers,
  clinicalRenderers,
} from './renderer-set';
export { OMF_CONTROL_RANK, STANDARD_RANK, omfControlIs, readOmf } from './testers';
