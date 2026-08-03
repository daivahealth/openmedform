'use client';

/**
 * Live stage checklist for a running conversion.
 *
 * The server records where the job actually is (conversion_job.stage), the
 * dialog's existing 2-second poll delivers it, and this draws it. No
 * percentage on purpose: most of the wall time is one LLM call of
 * unpredictable length, so a 0–100% bar would crawl to ~85% and freeze —
 * worse than a spinner. What replaces it is proof of life: real stages
 * checking off, a ticking clock, and rotating sub-messages during the long
 * stage.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import type { ConversionJob } from '@/hooks/use-conversions';

/** Ordered to match the server's pipeline (form-conversion.service.ts). */
const STAGES = [
  { key: 'READING_SOURCE', label: 'Reading the source file' },
  { key: 'GENERATING', label: 'Generating the form with AI' },
  { key: 'VALIDATING', label: 'Validating & assembling schemas' },
  { key: 'SAVING', label: 'Saving the draft' },
] as const;

/**
 * Client-side flavour for the AI stage, which dominates the wall time. These
 * describe what the model is genuinely asked to produce, in order — but they
 * rotate on a timer, not on real signal, so they are phrased as activity
 * ("Extracting…") rather than as completed facts.
 */
const GENERATING_MESSAGES = [
  'Extracting fields and labels…',
  'Building the layout…',
  'Deriving scoring rules…',
  'Writing the print schema…',
  'Collecting translations…',
  'Still working — large forms take a while…',
];

const MESSAGE_ROTATE_MS = 7000;

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ConversionProgress({ job }: { job: ConversionJob | null }) {
  const [elapsed, setElapsed] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    const rotate = setInterval(() => {
      setMessageIndex((i) => Math.min(i + 1, GENERATING_MESSAGES.length - 1));
    }, MESSAGE_ROTATE_MS);
    return () => {
      clearInterval(tick);
      clearInterval(rotate);
    };
  }, []);

  // Before the first poll lands, the job is PENDING with no stage — treat that
  // as the first stage so the checklist never renders fully inert.
  const activeIndex = Math.max(
    0,
    STAGES.findIndex((s) => s.key === (job?.stage ?? 'READING_SOURCE')),
  );

  return (
    <div className="flex flex-col gap-4 py-6">
      <ol className="mx-auto flex w-full max-w-sm flex-col gap-3">
        {STAGES.map((stage, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li key={stage.key} className="flex items-start gap-3">
              {done ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              ) : active ? (
                <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/30" />
              )}
              <div className="min-w-0">
                <p
                  className={
                    done
                      ? 'text-sm text-muted-foreground line-through decoration-muted-foreground/40'
                      : active
                        ? 'text-sm font-medium'
                        : 'text-sm text-muted-foreground/60'
                  }
                >
                  {stage.label}
                </p>
                {active && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {stage.key === 'GENERATING'
                      ? [job?.stageDetail, GENERATING_MESSAGES[messageIndex]]
                          .filter(Boolean)
                          .join(' — ')
                      : (job?.stageDetail ?? undefined)}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-center text-xs tabular-nums text-muted-foreground">
        {formatElapsed(elapsed)} elapsed
        {elapsed >= 120 ? ' — nearly there, complex forms can take a few minutes' : ''}
      </p>
    </div>
  );
}
