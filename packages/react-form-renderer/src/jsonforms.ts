/**
 * @openmedform/react-form-renderer/jsonforms
 *
 * Formio-free entry point. Import from here when your app only needs the
 * JSON Forms engine (the portable, engine-separated definitions produced by the
 * "Download" / export flow). This avoids pulling in the heavy Form.io stack that
 * the top-level `FormRenderer` dispatcher depends on.
 *
 *   import { JsonFormsRenderer } from '@openmedform/react-form-renderer/jsonforms';
 */

export { JsonFormsRenderer } from './engine/jsonforms/JsonFormsRenderer';
export type { JsonFormsRendererProps } from './engine/jsonforms/JsonFormsRenderer';
export {
  rendererRegistry,
  omfRenderers,
  clinicalRenderers,
} from './engine/jsonforms/renderer-registry';
