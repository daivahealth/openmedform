import { Injectable } from '@nestjs/common';

const ALLOWED_COMPONENT_TYPES = new Set([
  'textfield',
  'textarea',
  'number',
  'checkbox',
  'select',
  'radio',
  'datetime',
  'panel',
  'columns',
  'table',
  'tabs',
  'htmlelement',
  'button',
  'signature',
  'email',
  'phoneNumber',
  'url',
  'currency',
  'hidden',
  'container',
  'datagrid',
  'editgrid',
  'well',
  'fieldset',
  'content',
  'scoringMatrix',
  'colorCodedGrid',
  'riskStratification',
  'signatureDate',
  'clinicalReferenceTable',
]);

@Injectable()
export class SchemaValidatorService {
  /**
   * Validates a Form.io schema for structural correctness.
   * Returns a list of validation errors (empty means valid).
   */
  validate(schema: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Array.isArray(schema.components)) {
      errors.push('Schema must have a "components" array.');
      return { valid: false, errors };
    }

    const allKeys = new Set<string>();
    const allComponentKeys: string[] = [];

    this.walkComponents(
      schema.components as Record<string, unknown>[],
      (component, path) => {
        // Every component must have a type
        if (!component.type) {
          errors.push(`Component at ${path} is missing a "type" property.`);
        } else if (!ALLOWED_COMPONENT_TYPES.has(component.type as string)) {
          errors.push(
            `Component at ${path} has unknown type "${component.type}".`,
          );
        }

        // Every component must have a key
        if (!component.key) {
          errors.push(`Component at ${path} is missing a "key" property.`);
        } else {
          allComponentKeys.push(component.key as string);
        }

        // Collect keys for riskStratification scoreField validation
        if (component.key) {
          allKeys.add(component.key as string);
        }
      },
    );

    // Check key uniqueness
    const keyCounts = new Map<string, number>();
    for (const key of allComponentKeys) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of keyCounts) {
      if (count > 1) {
        errors.push(`Duplicate component key "${key}" found ${count} times.`);
      }
    }

    // Validate riskStratification scoreField references
    this.walkComponents(
      schema.components as Record<string, unknown>[],
      (component, path) => {
        if (component.type === 'riskStratification') {
          const scoreField = component.scoreField as string | undefined;
          if (!scoreField) {
            errors.push(
              `riskStratification component at ${path} is missing a "scoreField" property.`,
            );
          } else if (!allKeys.has(scoreField)) {
            errors.push(
              `riskStratification component at ${path} references scoreField "${scoreField}" which does not exist in the schema.`,
            );
          }
        }
      },
    );

    return { valid: errors.length === 0, errors };
  }

  /**
   * Recursively walks Form.io components, handling nested structures:
   * - components[] (panels, containers, fieldsets, wells, tabs, etc.)
   * - columns[].components (column layouts)
   * - rows[][].components (table layouts)
   */
  private walkComponents(
    components: Record<string, unknown>[],
    visitor: (component: Record<string, unknown>, path: string) => void,
    parentPath = 'root',
  ): void {
    if (!Array.isArray(components)) return;

    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      if (!component || typeof component !== 'object') continue;

      const path = `${parentPath}.components[${i}]`;
      visitor(component, path);

      if (Array.isArray(component.components)) {
        this.walkComponents(
          component.components as Record<string, unknown>[],
          visitor,
          path,
        );
      }

      if (Array.isArray(component.columns)) {
        const columns = component.columns as Record<string, unknown>[];
        for (let c = 0; c < columns.length; c++) {
          const column = columns[c];
          if (column && Array.isArray(column.components)) {
            this.walkComponents(
              column.components as Record<string, unknown>[],
              visitor,
              `${path}.columns[${c}]`,
            );
          }
        }
      }

      if (Array.isArray(component.rows)) {
        const rows = component.rows as Record<string, unknown>[][];
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          if (!Array.isArray(row)) continue;
          for (let c = 0; c < row.length; c++) {
            const cell = row[c];
            if (cell && Array.isArray(cell.components)) {
              this.walkComponents(
                cell.components as Record<string, unknown>[],
                visitor,
                `${path}.rows[${r}][${c}]`,
              );
            }
          }
        }
      }
    }
  }
}
