/**
 * @openmedform/react-form-renderer
 *
 * React renderer for OpenMedForm form definitions. Render any FormDefinition
 * with <FormRenderer definition={...} />.
 */

export { FormRenderer } from './FormRenderer';
export type { FormRendererProps } from './FormRenderer';

export { ReviewSurface } from './ReviewSurface';
export type { ReviewSurfaceProps } from './ReviewSurface';

export { JsonFormsRenderer } from './engine/jsonforms/JsonFormsRenderer';
export type { JsonFormsRendererProps } from './engine/jsonforms/JsonFormsRenderer';

export {
  rendererRegistry,
  omfRenderers,
  clinicalRenderers,
} from './engine/jsonforms/renderer-registry';
