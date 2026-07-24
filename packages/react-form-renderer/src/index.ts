/**
 * @openmedform/react-form-renderer
 *
 * React engine dispatcher for the dual-engine form platform. Render any
 * FormDefinition with <FormRenderer definition={...} />; it routes to the
 * Form.io or JSON Forms engine automatically.
 */

export { FormRenderer } from './FormRenderer';
export type { FormRendererProps } from './FormRenderer';

export { ReviewSurface } from './ReviewSurface';
export type { ReviewSurfaceProps } from './ReviewSurface';

export { JsonFormsRenderer } from './engine/jsonforms/JsonFormsRenderer';
export type { JsonFormsRendererProps } from './engine/jsonforms/JsonFormsRenderer';
export { FormioBranch } from './engine/formio/FormioRenderer';
export type { FormioBranchProps } from './engine/formio/FormioRenderer';

export {
  rendererRegistry,
  omfRenderers,
  clinicalRenderers,
} from './engine/jsonforms/renderer-registry';
