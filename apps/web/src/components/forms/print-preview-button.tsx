'use client';

import { Printer } from 'lucide-react';
import { renderPrintHtml } from '@openmedform/form-print-engine';
import { Button } from '@/components/ui/button';
import {
  toJsonFormsDefinition,
  type ApiForm,
  type ApiVersion,
} from '@/components/forms/jsonforms-renderer-wrapper';

interface Props {
  form: ApiForm;
  version?: ApiVersion;
  /** Optional filled data (e.g. a submission) to pre-fill the printed sheet. */
  data?: Record<string, unknown>;
  size?: 'sm' | 'default';
  label?: string;
}

/**
 * Opens the A4 print reconstruction of a jsonforms form in a new tab and
 * triggers the browser print dialog (its live preview shows the paginated A4).
 * Rendering is client-side via the shared print engine — no server round-trip.
 */
export function PrintPreviewButton({
  form,
  version,
  data,
  size = 'sm',
  label = 'Print preview',
}: Props) {
  function handleClick() {
    try {
      const definition = toJsonFormsDefinition(form, version);
      const html = renderPrintHtml(definition, data ? { data } : undefined);
      // Preferred: open the A4 document in a new tab (viewable preview) and
      // trigger print. A direct user click is allowed by normal pop-up blockers.
      const w = window.open('', '_blank', 'width=900,height=1000');
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.setTimeout(() => w.print(), 400);
        return;
      }
      // Fallback (strict pop-up blockers): print via a hidden iframe — no tab,
      // but the browser print dialog (with its live A4 preview) still opens.
      printViaIframe(html);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Could not build the print preview.',
      );
    }
  }

  return (
    <Button variant="outline" size={size} onClick={handleClick}>
      <Printer className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}

/** Print an HTML document through an off-screen iframe, then clean it up. */
function printViaIframe(html: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  const win = iframe.contentWindow!;
  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  win.addEventListener('afterprint', cleanup);
  doc.open();
  doc.write(html);
  doc.close();
  win.setTimeout(() => {
    win.focus();
    win.print();
    // Safety net if afterprint never fires (e.g. dialog dismissed silently).
    setTimeout(cleanup, 60000);
  }, 400);
}
