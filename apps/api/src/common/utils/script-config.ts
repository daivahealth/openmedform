/**
 * Read the declarative config out of a mock-up's scripts — by PARSING them,
 * never by running them.
 *
 * WHY THIS EXISTS — AI-generated mock-ups keep their most valuable clinical
 * structure inside `<script>`, not in the markup:
 *
 *   const glycaemiaCategories = [
 *     { max: 40,  label: 'Severe hypoglycaemia' },
 *     { max: 53,  label: 'Hypoglycaemia' },
 *     …
 *   ];
 *   const interventionsByCategory = { hypo: ['15g glucose', 'Recheck in 15 min'], … };
 *
 * Scripts are stripped before anything reaches the model, so conversion has
 * been capturing the fields and none of the behaviour: the forms come out
 * structurally right and behaviourally flat. That config is exactly the enum
 * options, reference-table rows and threshold bands the platform already
 * renders.
 *
 * SECURITY MODEL — this narrows, under explicit per-upload consent, the
 * strip-scripts default. It is not a reversal of it:
 *
 * - **Parse, never execute.** acorn builds an AST and we read it. No `eval`, no
 *   `Function`, no VM, no browser. Nothing in the file can run.
 * - **Literals only.** A value is kept only if the whole subtree is string /
 *   number / boolean / null / array / object-with-literal-values. Anything with
 *   an identifier, a call, a template hole, a spread, a getter or a function in
 *   it is discarded whole — not partially salvaged.
 * - **Named top-level bindings only.** We read `const x = <literal>` at the top
 *   level (and inside a top-level IIFE, which is how these mock-ups are
 *   usually wrapped). Not arbitrary expressions, not nested scopes.
 * - **Hard caps** on script bytes parsed, entries returned, value depth, string
 *   length and total payload, so a pathological file costs a bounded parse.
 * - **Still untrusted.** What comes out is DATA. The caller labels it as
 *   attacker-controlled in the prompt exactly like the markup, and every string
 *   inside it is a value the reviewer sees in the conversion diff.
 *
 * Off unless the uploader asks for it. `extractScriptConfig()` is only called
 * when the request carries the opt-in.
 */

import { parse } from 'acorn';
import type { Node } from 'acorn';

/** One named literal binding found in the mock-up's scripts. */
export interface ScriptConfigEntry {
  /** The binding's identifier, e.g. 'interventionsByCategory'. */
  name: string;
  /** The literal value, safe to JSON-serialise. */
  value: JsonLiteral;
}

export type JsonLiteral =
  | string
  | number
  | boolean
  | null
  | JsonLiteral[]
  | { [key: string]: JsonLiteral };

export interface ScriptConfigResult {
  entries: ScriptConfigEntry[];
  /** Human-facing notes about what was skipped and why. */
  warnings: string[];
}

/**
 * Caps. Every one of these bounds work an uploaded file can ask us to do, or
 * bounds how much attacker-chosen text can reach the model.
 */
/** Total script bytes handed to the parser. */
const MAX_SCRIPT_BYTES = 256 * 1024;
/** Named bindings returned. */
const MAX_ENTRIES = 40;
/** Nesting depth inside one value. */
const MAX_DEPTH = 6;
/** Array/object members at one level. */
const MAX_MEMBERS = 200;
/** Characters in one extracted string. */
const MAX_STRING = 300;
/** Serialised size of everything returned, so the prompt cannot be flooded. */
const MAX_TOTAL_CHARS = 12_000;

/**
 * Bindings that are config by name. Everything else is skipped even when its
 * value is a perfectly good literal, because a mock-up's scripts are full of
 * literals that are not clinical config — CSS strings, selector lists, colour
 * maps, i18n scaffolding — and each one is prompt budget spent on noise.
 */
const CONFIG_NAME = /(categor|interven|option|choice|list|table|ref|score|stage|band|threshold|range|level|grade|type|reason|site|drug|med|dose|unit|label|item|step|rule|map|matrix|risk|action)/i;

/** Names that are plainly presentation or wiring rather than clinical config. */
const NOT_CONFIG_NAME = /^(css|style|styles|class|classes|selector|selectors|colou?rs?|icons?|svg|path|paths|url|urls|endpoint|api|config|debug|version)$/i;

interface Ctx {
  warnings: Set<string>;
  chars: number;
}

/** Marker for "this subtree is not a pure literal" — distinct from JSON null. */
const NOT_LITERAL = Symbol('not-literal');
type Maybe = JsonLiteral | typeof NOT_LITERAL;

/**
 * Convert an AST node to a literal, or refuse.
 *
 * Refusing is the default: only node types listed here can produce a value, so
 * a syntax we have not thought about cannot leak through as something else.
 */
function literalOf(node: Node | null | undefined, depth: number, ctx: Ctx): Maybe {
  if (!node || depth > MAX_DEPTH) {
    if (node) ctx.warnings.add('a value nested deeper than the depth limit was skipped');
    return NOT_LITERAL;
  }

  const n = node as unknown as Record<string, unknown>;
  switch (node.type) {
    case 'Literal': {
      const value = n['value'];
      if (value === null) return null;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return Number.isFinite(value) ? value : NOT_LITERAL;
      if (typeof value === 'string') {
        if (value.length > MAX_STRING) {
          ctx.warnings.add('a string longer than the length limit was skipped');
          return NOT_LITERAL;
        }
        return value;
      }
      // RegExp and BigInt literals are neither config nor JSON.
      return NOT_LITERAL;
    }

    case 'TemplateLiteral': {
      // Only a hole-free template — `foo` — is a literal. `${x}` is code.
      const exprs = n['expressions'] as unknown[];
      const quasis = n['quasis'] as Array<{ value: { cooked?: string | null } }>;
      if (exprs.length > 0 || quasis.length !== 1) return NOT_LITERAL;
      const text = quasis[0]?.value?.cooked;
      if (typeof text !== 'string' || text.length > MAX_STRING) return NOT_LITERAL;
      return text;
    }

    case 'UnaryExpression': {
      // Negative numbers arrive as -1, i.e. unary minus over a literal.
      if (n['operator'] !== '-' && n['operator'] !== '+') return NOT_LITERAL;
      const inner = literalOf(n['argument'] as Node, depth, ctx);
      if (typeof inner !== 'number') return NOT_LITERAL;
      return n['operator'] === '-' ? -inner : inner;
    }

    case 'ArrayExpression': {
      const elements = n['elements'] as Array<Node | null>;
      if (elements.length > MAX_MEMBERS) {
        ctx.warnings.add('an array longer than the member limit was skipped');
        return NOT_LITERAL;
      }
      const out: JsonLiteral[] = [];
      for (const el of elements) {
        // A hole (`[1, , 2]`) or a spread makes the array non-literal.
        if (!el) return NOT_LITERAL;
        const value = literalOf(el, depth + 1, ctx);
        if (value === NOT_LITERAL) return NOT_LITERAL;
        out.push(value);
      }
      return out;
    }

    case 'ObjectExpression': {
      const props = n['properties'] as Array<Record<string, unknown>>;
      if (props.length > MAX_MEMBERS) {
        ctx.warnings.add('an object with more members than the limit was skipped');
        return NOT_LITERAL;
      }
      const out: Record<string, JsonLiteral> = {};
      for (const prop of props) {
        // Spread, getters, setters, methods and shorthand-with-default are code.
        if (prop['type'] !== 'Property') return NOT_LITERAL;
        if (prop['kind'] !== 'init' || prop['method'] === true) return NOT_LITERAL;

        const keyNode = prop['key'] as Record<string, unknown>;
        let key: string;
        if (prop['computed'] === true) return NOT_LITERAL;
        if (keyNode['type'] === 'Identifier') key = String(keyNode['name']);
        else if (keyNode['type'] === 'Literal' && typeof keyNode['value'] !== 'object')
          key = String(keyNode['value']);
        else return NOT_LITERAL;
        if (key.length > MAX_STRING) return NOT_LITERAL;

        const value = literalOf(prop['value'] as Node, depth + 1, ctx);
        if (value === NOT_LITERAL) return NOT_LITERAL;
        out[key] = value;
      }
      return out;
    }

    default:
      // Identifiers, calls, member access, functions, arrow bodies, `new`,
      // conditionals, assignments — all code, all refused.
      return NOT_LITERAL;
  }
}

/** Worth showing the model? Config-shaped name, and a container value. */
function isInteresting(name: string, value: JsonLiteral): boolean {
  if (NOT_CONFIG_NAME.test(name)) return false;
  if (!CONFIG_NAME.test(name)) return false;
  // A lone string or number is a setting, not the option list we are after.
  if (typeof value !== 'object' || value === null) return false;
  return Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0;
}

/** Statements to search: the top level, plus a top-level IIFE's body. */
function topLevelStatements(program: Node): Node[] {
  const out: Node[] = [];
  const body = (program as unknown as { body: Node[] }).body ?? [];
  for (const stmt of body) {
    out.push(stmt);
    // Mock-ups routinely wrap everything in (function(){ … })() or (() => { … })().
    const expr = (stmt as unknown as { expression?: Record<string, unknown> }).expression;
    if ((stmt as Node).type === 'ExpressionStatement' && expr?.['type'] === 'CallExpression') {
      const callee = expr['callee'] as Record<string, unknown> | undefined;
      if (
        callee?.['type'] === 'FunctionExpression' ||
        callee?.['type'] === 'ArrowFunctionExpression'
      ) {
        const inner = callee['body'] as Record<string, unknown> | undefined;
        if (inner?.['type'] === 'BlockStatement') out.push(...((inner['body'] as Node[]) ?? []));
      }
    }
  }
  return out;
}

/**
 * Extract named literal config from `scripts` (the raw text of every `<script>`
 * in the upload, in document order).
 *
 * Never throws: a mock-up whose script does not parse simply yields nothing,
 * because a parse failure is not a reason to fail the conversion.
 */
export function extractScriptConfig(scripts: string[]): ScriptConfigResult {
  const ctx: Ctx = { warnings: new Set(), chars: 0 };
  const entries: ScriptConfigEntry[] = [];
  const seen = new Set<string>();

  let budget = MAX_SCRIPT_BYTES;
  for (const script of scripts) {
    if (budget <= 0) {
      ctx.warnings.add('some scripts were past the size limit and were not parsed');
      break;
    }
    const source = script.length > budget ? script.slice(0, budget) : script;
    budget -= source.length;

    let program: Node;
    try {
      program = parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        // A mock-up's inline script is not a module and need not be strict;
        // tolerate return-at-top-level rather than losing the whole file.
        allowReturnOutsideFunction: true,
      }) as unknown as Node;
    } catch {
      ctx.warnings.add('a script could not be parsed and was skipped');
      continue;
    }

    for (const stmt of topLevelStatements(program)) {
      if (entries.length >= MAX_ENTRIES) break;
      if (stmt.type !== 'VariableDeclaration') continue;

      const decls = (stmt as unknown as { declarations: Array<Record<string, unknown>> })
        .declarations;
      for (const decl of decls) {
        if (entries.length >= MAX_ENTRIES) break;
        const id = decl['id'] as Record<string, unknown>;
        // Destructuring binds no single name we could report.
        if (id?.['type'] !== 'Identifier') continue;
        const name = String(id['name']);
        if (seen.has(name)) continue;

        const value = literalOf(decl['init'] as Node, 0, ctx);
        if (value === NOT_LITERAL) continue;
        if (!isInteresting(name, value)) continue;

        const size = JSON.stringify(value).length + name.length;
        if (ctx.chars + size > MAX_TOTAL_CHARS) {
          ctx.warnings.add(
            'script config was truncated at the total size limit; later definitions were not included',
          );
          budget = 0;
          break;
        }
        ctx.chars += size;
        seen.add(name);
        entries.push({ name, value });
      }
    }
  }

  if (entries.length >= MAX_ENTRIES) {
    ctx.warnings.add(`only the first ${MAX_ENTRIES} script definitions were read`);
  }

  return { entries, warnings: [...ctx.warnings] };
}
