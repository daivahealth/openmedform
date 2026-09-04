import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create your account',
  description:
    'Create an OpenMedForm organization and start generating clinical forms with AI. Free to start, no credit card required.',
  alternates: { canonical: '/signup' },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
