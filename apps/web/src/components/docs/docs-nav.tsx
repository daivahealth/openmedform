'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { DocSection } from '@/lib/docs/registry';

/**
 * The docs sidebar. Sections are resolved on the server and passed in — the
 * registry reads the filesystem and cannot be imported from a client bundle.
 *
 * Every published page links to every other one, so a crawler that reaches any
 * doc reaches all of them. An orphaned page is a page that does not get
 * indexed.
 */
export function DocsNav({ sections }: { sections: DocSection[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation" className="space-y-6 text-sm">
      {sections.map((section) => (
        <div key={section.key}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {section.title}
          </div>
          <ul className="space-y-1">
            {section.docs.map((doc) => {
              const active = doc.route === pathname;
              return (
                <li key={doc.route}>
                  <Link
                    href={doc.route}
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? 'block rounded-md bg-muted px-2 py-1 font-medium text-foreground'
                        : 'block rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground'
                    }
                  >
                    {doc.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
