import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class SchemaAssemblerService {
  /**
   * Post-processes raw LLM output into valid Form.io JSON.
   * Handles markdown code fences, trailing commas, surrounding text,
   * and deduplicates component keys.
   */
  assemble(rawOutput: string): Record<string, unknown> {
    const schema = this.parseJson(rawOutput);

    if (!schema.display) {
      schema.display = 'form';
    }

    if (!Array.isArray(schema.components)) {
      schema.components = [];
    }

    this.deduplicateKeys(schema.components as Record<string, unknown>[]);

    return schema;
  }

  private parseJson(raw: string): Record<string, unknown> {
    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    let cleaned = raw.replace(/```(?:json)?\s*\n?/gi, '').replace(/```\s*$/gm, '');

    // Extract the outermost JSON object if surrounded by non-JSON text
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new BadRequestException(
        'Failed to parse AI output: no valid JSON object found in the response.',
      );
    }

    cleaned = cleaned.substring(firstBrace, lastBrace + 1);

    // Remove trailing commas before } or ]
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

    try {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Parsed value is not a JSON object.');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new BadRequestException(
        'Failed to parse AI output as JSON. The model response was malformed.',
      );
    }
  }

  /**
   * Walk all components recursively and deduplicate keys by appending _1, _2, etc.
   */
  private deduplicateKeys(components: Record<string, unknown>[]): void {
    const seen = new Map<string, number>();
    this.walkComponents(components, (component) => {
      const key = component.key as string | undefined;
      if (!key) return;

      const count = seen.get(key) ?? 0;
      if (count > 0) {
        component.key = `${key}_${count}`;
      }
      seen.set(key, count + 1);
    });
  }

  /**
   * Recursively walks Form.io components, handling nested structures:
   * - components[] (panels, containers, fieldsets, wells, tabs, etc.)
   * - columns[].components (column layouts)
   * - rows[][].components (table layouts)
   */
  private walkComponents(
    components: Record<string, unknown>[],
    visitor: (component: Record<string, unknown>) => void,
  ): void {
    if (!Array.isArray(components)) return;

    for (const component of components) {
      if (!component || typeof component !== 'object') continue;

      visitor(component);

      // Direct nested components (panels, containers, fieldsets, wells, tabs, etc.)
      if (Array.isArray(component.components)) {
        this.walkComponents(
          component.components as Record<string, unknown>[],
          visitor,
        );
      }

      // Column layouts: columns[].components
      if (Array.isArray(component.columns)) {
        for (const column of component.columns as Record<string, unknown>[]) {
          if (column && Array.isArray(column.components)) {
            this.walkComponents(
              column.components as Record<string, unknown>[],
              visitor,
            );
          }
        }
      }

      // Table layouts: rows[][] where each cell can have components
      if (Array.isArray(component.rows)) {
        for (const row of component.rows as Record<string, unknown>[][]) {
          if (!Array.isArray(row)) continue;
          for (const cell of row) {
            if (cell && Array.isArray(cell.components)) {
              this.walkComponents(
                cell.components as Record<string, unknown>[],
                visitor,
              );
            }
          }
        }
      }
    }
  }
}
