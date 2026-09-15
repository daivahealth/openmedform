import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/providers/query-provider';
import { AuthProvider } from '@/providers/auth-provider';
import {
  siteDescription,
  siteKeywords,
  siteName,
  siteTagline,
  siteUrl,
} from '@/lib/site';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  // Lets every nested route express canonical/OG URLs as relative paths.
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} — ${siteTagline}`,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: siteKeywords,
  applicationName: siteName,
  authors: [{ name: 'Daiva Health', url: 'https://daiva.health' }],
  creator: 'Daiva Health',
  publisher: 'Daiva Health',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName,
    title: `${siteName} — ${siteTagline}`,
    description: siteDescription,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteName} — ${siteTagline}`,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Let Google show full-length text and large image previews rather than
      // the conservative defaults, which is what feeds AI Overviews.
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  category: 'technology',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
