import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class SchemaAssemblerService {
  /**
   * Post-processes raw LLM output into valid Form.io JSON.
   * Handles markdown code fences, trailing commas, surrounding text,
   * and deduplicates component keys.
   */
  assemble(rawOutput: string): Record<string, unknown> {
    const parsed = this.parseJson(rawOutput);
    const schema = this.unwrapSchema(parsed);

    if (!schema.display) {
      schema.display = 'form';
    }

    if (!Array.isArray(schema.components)) {
      schema.components = [];
    }

    this.deduplicateKeys(schema.components as Record<string, unknown>[]);
    this.normalizeSubmitButton(schema.components as Record<string, unknown>[]);

    return schema;
  }

  assembleWithSummary(rawOutput: string): { schema: Record<string, unknown>; changeSummary?: string } {
    const parsed = this.parseJson(rawOutput);
    const changeSummary = typeof parsed.changeSummary === 'string' ? parsed.changeSummary : undefined;
    const schema = this.unwrapSchema(parsed);

    if (!schema.display) {
      schema.display = 'form';
    }

    if (!Array.isArray(schema.components)) {
      schema.components = [];
    }

    this.deduplicateKeys(schema.components as Record<string, unknown>[]);
    this.normalizeSubmitButton(schema.components as Record<string, unknown>[]);

    return { schema, changeSummary };
  }

  private unwrapSchema(parsed: Record<string, unknown>): Record<string, unknown> {
    if (parsed.schema && typeof parsed.schema === 'object' && !Array.isArray(parsed.schema)) {
      return parsed.schema as Record<string, unknown>;
    }
    return parsed;
  }

  private parseJson(raw: string): Record<string, unknown> {
    // Strip markdown code fences
    let cleaned = raw.replace(/```(?:json|JSON)?\s*\n?/gi, '').replace(/```\s*$/gm, '');

    // Remove JS-style comments while preserving string contents
    cleaned = this.stripComments(cleaned);

    // Find the largest valid JSON object using brace matching
    const jsonStr = this.extractLargestJsonObject(cleaned);

    if (!jsonStr) {
      const truncated = this.isTruncated(cleaned);
      const preview = cleaned.substring(0, 200);
      const tail = cleaned.substring(Math.max(0, cleaned.length - 200));
      throw new BadRequestException(
        truncated
          ? `AI output was truncated (${cleaned.length} chars). The response was cut off before the JSON was complete. Try simplifying your request or working on fewer components at once.`
          : `Failed to parse AI output: no valid JSON object found. Start: "${preview}..." End: "...${tail}"`,
      );
    }

    // Remove trailing commas before } or ]
    const fixedCommas = jsonStr.replace(/,\s*([}\]])/g, '$1');

    try {
      const parsed = JSON.parse(fixedCommas);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Parsed value is not a JSON object.');
      }
      return parsed as Record<string, unknown>;
    } catch (parseErr) {
      // Fallback: try the simple first-brace/last-brace approach
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const fallback = cleaned
          .substring(firstBrace, lastBrace + 1)
          .replace(/,\s*([}\]])/g, '$1');
        try {
          const parsed = JSON.parse(fallback);
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
        } catch {}
      }

      // If the output looks truncated, give a helpful message
      if (this.isTruncated(cleaned)) {
        throw new BadRequestException(
          `AI output was truncated (${cleaned.length} chars). The response was cut off before the JSON was complete. Try simplifying your request or working on fewer components at once.`,
        );
      }

      const errMsg = parseErr instanceof Error ? parseErr.message : 'unknown';
      throw new BadRequestException(
        `Failed to parse AI output as JSON (${errMsg}). Output length: ${cleaned.length} chars.`,
      );
    }
  }

  private extractLargestJsonObject(text: string): string | null {
    let best: string | null = null;
    let bestLen = 0;

    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '{') continue;

      let depth = 0;
      let inString = false;
      let escape = false;

      for (let j = i; j < text.length; j++) {
        const ch = text[j];

        if (escape) {
          escape = false;
          continue;
        }

        if (ch === '\\' && inString) {
          escape = true;
          continue;
        }

        if (ch === '"') {
          inString = !inString;
          continue;
        }

        if (inString) continue;

        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            const candidate = text.substring(i, j + 1);
            if (candidate.length > bestLen) {
              best = candidate;
              bestLen = candidate.length;
            }
            break;
          }
        }
      }
    }

    return best;
  }

  private stripComments(text: string): string {
    let result = '';
    let i = 0;
    while (i < text.length) {
      if (text[i] === '"') {
        // Walk through the entire string literal, preserving its content
        result += '"';
        i++;
        while (i < text.length && text[i] !== '"') {
          if (text[i] === '\\' && i + 1 < text.length) {
            result += text[i] + text[i + 1];
            i += 2;
          } else {
            result += text[i];
            i++;
          }
        }
        if (i < text.length) {
          result += '"';
          i++;
        }
      } else if (text[i] === '/' && i + 1 < text.length && text[i + 1] === '/') {
        // Single-line comment — skip to end of line
        i += 2;
        while (i < text.length && text[i] !== '\n') i++;
      } else if (text[i] === '/' && i + 1 < text.length && text[i + 1] === '*') {
        // Multi-line comment — skip to closing */
        i += 2;
        while (i < text.length && !(text[i] === '*' && i + 1 < text.length && text[i + 1] === '/')) i++;
        if (i < text.length) i += 2;
      } else {
        result += text[i];
        i++;
      }
    }
    return result;
  }

  private isTruncated(text: string): boolean {
    const trimmed = text.trimEnd();
    if (!trimmed) return false;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
    }
    return depth > 0;
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

  private normalizeSubmitButton(components: Record<string, unknown>[]): void {
    this.removeSubmitButtons(components);

    components.push({
      type: 'button',
      key: 'submit',
      label: 'Submit',
      action: 'submit',
      theme: 'primary',
    });
  }

  private removeSubmitButtons(components: Record<string, unknown>[]): void {
    for (let i = components.length - 1; i >= 0; i--) {
      const component = components[i];
      if (!component || typeof component !== 'object') continue;

      if (
        component.type === 'button' &&
        ((component.action as string | undefined) ?? '') === 'submit'
      ) {
        components.splice(i, 1);
        continue;
      }

      if (Array.isArray(component.components)) {
        this.removeSubmitButtons(
          component.components as Record<string, unknown>[],
        );
      }

      if (Array.isArray(component.columns)) {
        for (const column of component.columns as Record<string, unknown>[]) {
          if (column && Array.isArray(column.components)) {
            this.removeSubmitButtons(
              column.components as Record<string, unknown>[],
            );
          }
        }
      }

      if (Array.isArray(component.rows)) {
        for (const row of component.rows as Record<string, unknown>[][]) {
          if (!Array.isArray(row)) continue;
          for (const cell of row) {
            if (cell && Array.isArray(cell.components)) {
              this.removeSubmitButtons(
                cell.components as Record<string, unknown>[],
              );
            }
          }
        }
      }
    }
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
