import { ImageResponse } from 'next/og';
import { siteName, siteTagline } from '@/lib/site';

export const runtime = 'edge';
export const alt = `${siteName} — ${siteTagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// hsl(222.2 84% 4.9%) and hsl(221.2 83.2% 53.3%) from globals.css, resolved to
// hex because Satori renders without the stylesheet that defines those tokens.
const foreground = '#020817';
const primary = '#2563eb';
const muted = '#64748b';

/**
 * The social and AI-answer preview card. Generated rather than shipped as a
 * static asset so it stays in step with the tagline in one place.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: '#ffffff',
          padding: '80px',
          borderTop: `24px solid ${primary}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 34,
            fontWeight: 700,
            color: primary,
            letterSpacing: '-0.02em',
          }}
        >
          {siteName}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.1,
            color: foreground,
            letterSpacing: '-0.03em',
          }}
        >
          {siteTagline}.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 32,
            fontSize: 30,
            color: muted,
          }}
        >
          AI-generated forms coded to SNOMED CT, LOINC and ICD-10 — rendered
          natively in React, Angular and Flutter.
        </div>
      </div>
    ),
    size,
  );
}
