/**
 * Marketing architecture diagram for the landing page: shows how OpenMedForm
 * sits beside an EMR/EHR — AI builds versioned JSON form schemas, drop-in React
 * and Angular renderers embed them, and every submission is stored as JSON in
 * the customer's own database. Pure inline SVG (no external deps), theme-aware
 * via the shadcn CSS custom properties.
 */
export function ArchitectureDiagram() {
  const primary = 'hsl(var(--primary))';
  const border = 'hsl(var(--border))';
  const muted = 'hsl(var(--muted-foreground))';
  const fg = 'hsl(var(--foreground))';
  const cardBg = 'hsl(var(--card))';
  const primarySoft = 'hsl(var(--primary) / 0.08)';

  return (
    <svg
      viewBox="0 0 980 360"
      role="img"
      aria-label="OpenMedForm architecture: EMR or EHR connects to OpenMedForm, which uses AI to build versioned JSON form schemas rendered by React and Angular renderers, with submissions stored as JSON in your own database."
      className="mx-auto block h-auto w-full min-w-[760px]"
    >
      <defs>
        <marker
          id="omf-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={primary} />
        </marker>
      </defs>

      {/* Stage 1: EMR / EHR */}
      <g>
        <rect x="20" y="130" width="170" height="100" rx="12" fill={cardBg} stroke={border} strokeWidth="1.5" />
        <text x="105" y="170" textAnchor="middle" fontSize="17" fontWeight="700" fill={fg}>
          Your EMR / EHR
        </text>
        <text x="105" y="195" textAnchor="middle" fontSize="12" fill={muted}>
          Any system, any region
        </text>
      </g>

      {/* Arrow 1 */}
      <line x1="192" y1="180" x2="252" y2="180" stroke={primary} strokeWidth="2" markerEnd="url(#omf-arrow)" />

      {/* Stage 2: OpenMedForm */}
      <g>
        <rect x="255" y="55" width="270" height="250" rx="14" fill={primarySoft} stroke={primary} strokeWidth="1.5" />
        <text x="390" y="85" textAnchor="middle" fontSize="16" fontWeight="700" fill={primary}>
          OpenMedForm
        </text>

        <rect x="280" y="105" width="220" height="52" rx="9" fill={cardBg} stroke={border} strokeWidth="1.2" />
        <text x="390" y="130" textAnchor="middle" fontSize="13" fontWeight="600" fill={fg}>
          AI Form Builder
        </text>
        <text x="390" y="147" textAnchor="middle" fontSize="11" fill={muted}>
          Prompt · PDF · image → schema
        </text>

        <rect x="280" y="167" width="220" height="52" rx="9" fill={cardBg} stroke={border} strokeWidth="1.2" />
        <text x="390" y="192" textAnchor="middle" fontSize="13" fontWeight="600" fill={fg}>
          Versioned JSON Schemas
        </text>
        <text x="390" y="209" textAnchor="middle" fontSize="11" fill={muted}>
          Immutable published versions
        </text>

        <rect x="280" y="229" width="220" height="52" rx="9" fill={cardBg} stroke={border} strokeWidth="1.2" />
        <text x="390" y="254" textAnchor="middle" fontSize="13" fontWeight="600" fill={fg}>
          Server-side Scoring
        </text>
        <text x="390" y="271" textAnchor="middle" fontSize="11" fill={muted}>
          Clinical risk, recomputed
        </text>
      </g>

      {/* Arrow 2 */}
      <line x1="527" y1="180" x2="587" y2="180" stroke={primary} strokeWidth="2" markerEnd="url(#omf-arrow)" />

      {/* Stage 3: Renderers */}
      <g>
        <rect x="590" y="90" width="185" height="180" rx="12" fill={cardBg} stroke={border} strokeWidth="1.5" />
        <text x="682" y="118" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted}>
          Embedded in your app
        </text>

        <rect x="612" y="132" width="140" height="54" rx="9" fill={primarySoft} stroke={primary} strokeWidth="1.2" />
        <text x="682" y="164" textAnchor="middle" fontSize="14" fontWeight="700" fill={fg}>
          React Renderer
        </text>

        <rect x="612" y="196" width="140" height="54" rx="9" fill={primarySoft} stroke={primary} strokeWidth="1.2" />
        <text x="682" y="228" textAnchor="middle" fontSize="14" fontWeight="700" fill={fg}>
          Angular Renderer
        </text>
      </g>

      {/* Arrow 3 */}
      <line x1="777" y1="180" x2="837" y2="180" stroke={primary} strokeWidth="2" markerEnd="url(#omf-arrow)" />

      {/* Stage 4: Your database */}
      <g>
        <rect x="840" y="130" width="125" height="100" rx="12" fill={cardBg} stroke={border} strokeWidth="1.5" />
        <ellipse cx="902" cy="158" rx="34" ry="10" fill="none" stroke={primary} strokeWidth="1.5" />
        <path d="M 868 158 v 30 a 34 10 0 0 0 68 0 v -30" fill="none" stroke={primary} strokeWidth="1.5" />
        <text x="902" y="212" textAnchor="middle" fontSize="12" fontWeight="700" fill={fg}>
          Your database
        </text>
        <text x="902" y="228" textAnchor="middle" fontSize="11" fill={muted}>
          JSON, you own it
        </text>
      </g>

      {/* Data-ownership caption */}
      <text x="490" y="335" textAnchor="middle" fontSize="12" fill={muted}>
        Schemas and submissions stay as JSON in your own store — OpenMedForm never holds your clinical data.
      </text>
    </svg>
  );
}
