/**
 * @openmedform/react-form-renderer/jsonforms
 *
 * Retained as a stable alias of the package root. It existed to offer a
 * Form.io-free entry point back when the root pulled in the Form.io stack; with
 * that engine removed the root is already Form.io-free, so the two are
 * equivalent and existing imports keep working.
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
