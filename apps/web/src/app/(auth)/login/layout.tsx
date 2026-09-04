import type { Metadata } from 'next';

// The page itself is a client component and cannot export metadata, so the
// route's server layout carries it. Without this every route shared the root
// title, which search engines treat as duplicate pages.
export const metadata: Metadata = {
  title: 'Sign in',
  description:
    'Sign in to OpenMedForm to build, publish and manage AI-generated clinical forms.',
  alternates: { canonical: '/login' },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
