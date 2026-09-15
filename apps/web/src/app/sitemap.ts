import type { MetadataRoute } from 'next';
import { publishedDocs } from '@/lib/docs/registry';
import { publicRoutes, siteUrl } from '@/lib/site';

/**
 * Public marketing and entry routes, plus every published documentation page.
 * Authenticated application routes are excluded here and disallowed in
 * robots.txt — a sitemap entry for a page a crawler cannot fetch is a crawl
 * error, not a ranking signal.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const marketing = publicRoutes.map((route) => ({
    url: `${siteUrl}${route === '/' ? '' : route}`,
    lastModified,
    changeFrequency: (route === '/' ? 'weekly' : 'monthly') as
      | 'weekly'
      | 'monthly',
    priority: route === '/' ? 1 : 0.5,
  }));

  const docs = [
    {
      url: `${siteUrl}/docs`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    ...publishedDocs().map((doc) => ({
      url: `${siteUrl}${doc.route}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];

  return [...marketing, ...docs];
}
