import Link from 'next/link';
import { ClipboardList, Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocsNav } from '@/components/docs/docs-nav';
import { publishedSections } from '@/lib/docs/registry';
import { githubUrl } from '@/lib/site';

/**
 * Chrome for every /docs page. A server component throughout: the docs are
 * static content and none of this needs to reach the client.
 */
export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <Link href="/" className="flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">OpenMedForm</span>
            </Link>
            <Link
              href="/docs"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Docs
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              <Github className="h-5 w-5" />
            </a>
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-10 px-4 py-10 sm:px-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-24">
            <DocsNav sections={publishedSections()} />
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
