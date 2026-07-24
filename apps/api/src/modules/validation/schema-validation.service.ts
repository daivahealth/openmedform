import { Injectable } from '@nestjs/common';
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

export interface ValidationError {
  instancePath: string;
  keyword: string;
  message: string;
  params: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Server-side JSON Schema (Draft 2020-12) validation for jsonforms-engine
 * submissions. This is authoritative: the client's validation is advisory, and
 * every submit is re-validated here against the exact published data schema
 * before the response is accepted (Form Engine Rules — never trust the client).
 *
 * Mirrors @openmedform/form-core's validateData, reimplemented here because the
 * NestJS (CommonJS) backend cannot cleanly consume that ESM package.
 */
@Injectable()
export class SchemaValidationService {
  private readonly ajv: Ajv2020;

  constructor() {
    this.ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(this.ajv);
  }

  /** Validate `data` against a Data Schema. Returns validity + normalized errors. */
  validate(dataSchema: unknown, data: unknown): ValidationResult {
    let validateFn;
    try {
      validateFn = this.ajv.compile(dataSchema as object);
    } catch (err) {
      // A schema that will not compile is a definition-level bug, surfaced as an
      // invalid result rather than a thrown 500.
      return {
        valid: false,
        errors: [
          {
            instancePath: '',
            keyword: 'schema',
            message: err instanceof Error ? err.message : String(err),
            params: {},
          },
        ],
      };
    }

    const valid = validateFn(data) as boolean;
    return {
      valid,
      errors: valid ? [] : this.toErrors(validateFn.errors),
    };
  }

  /**
   * Assert a Data Schema compiles under Ajv 2020-12. Returns null on success or
   * an error message. Used to reject AI-generated schemas before persisting.
   */
  checkCompiles(dataSchema: unknown): string | null {
    try {
      this.ajv.compile(dataSchema as object);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  private toErrors(errors: ErrorObject[] | null | undefined): ValidationError[] {
    return (errors ?? []).map((e) => ({
      instancePath: e.instancePath,
      keyword: e.keyword,
      message: e.message ?? '',
      params: e.params as Record<string, unknown>,
    }));
  }
}
