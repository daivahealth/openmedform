/**
 * Data Schema — a structural TypeScript view of JSON Schema Draft 2020-12.
 *
 * This is the SOURCE OF TRUTH for form data structure and validation. It must
 * NOT contain any visual/layout information (that lives in the UI Schema).
 *
 * The type is a permissive subset: it names the keywords the platform relies on
 * while keeping an index signature so any other valid 2020-12 keyword passes
 * through untyped rather than being rejected at compile time.
 */

export type JsonSchemaType =
  | 'object'
  | 'array'
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'null';

export interface JsonSchema {
  $schema?: string;
  $id?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;

  type?: JsonSchemaType | JsonSchemaType[];
  title?: string;
  description?: string;
  default?: unknown;
  readOnly?: boolean;

  // object
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  patternProperties?: Record<string, JsonSchema>;

  // array
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // string
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  /** date | time | date-time | email | uri | uuid | ... */
  format?: string;

  // numeric
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // enumerations / constants
  enum?: unknown[];
  const?: unknown;

  // composition
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  not?: JsonSchema;

  // conditional application
  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;

  /** Forward-compatibility escape hatch for any other 2020-12 keyword. */
  [key: string]: unknown;
}
