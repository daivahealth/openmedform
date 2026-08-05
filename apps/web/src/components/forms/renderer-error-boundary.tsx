'use client';

import { Component, type ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  /** Names the surface in the message, e.g. "form preview". */
  surface: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a crash inside a rendered form and degrades it to an inline,
 * DIAGNOSABLE error instead of Next's whole-page "Application error: a
 * client-side exception has occurred (see the browser console)".
 *
 * A form definition is data — AI-generated data at that — so the renderer is
 * the one part of the app whose input is genuinely open-ended. A definition
 * shape nobody anticipated must cost the user one form's rendering, not the
 * page chrome, the chat panel, and the navigation; and the message must carry
 * the actual error so a report contains something actionable rather than
 * "see the console".
 */
export class RendererErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        <p className="flex items-center gap-2 font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          This {this.props.surface} could not be displayed.
        </p>
        <p className="mt-2 break-words font-mono text-xs opacity-90">
          {error.message || String(error)}
        </p>
        <p className="mt-2 text-xs opacity-90">
          The rest of the page still works. If this form was AI-generated, “Refine with AI” can
          usually repair it — describe what you expected to see. Please report this message if it
          keeps happening.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-red-300 bg-transparent hover:bg-red-100 dark:hover:bg-red-900"
          onClick={() => this.setState({ error: null })}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    );
  }
}
