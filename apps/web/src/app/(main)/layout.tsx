import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/app-shell';

// Every route in this group is behind authentication and has no business in a
// search index. robots.txt already disallows crawling them; this covers the
// case where a crawler reaches the URL from a link rather than the sitemap.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  // Drop the root canonical rather than inherit it: a noindex page pointing at
  // the homepage as its canonical sends two contradictory signals at once.
  alternates: { canonical: null },
};

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
