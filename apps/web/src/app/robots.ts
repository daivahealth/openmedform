import type { MetadataRoute } from 'next';
import { privateRoutes, siteUrl } from '@/lib/site';

/**
 * Everything behind authentication is disallowed; the marketing surface is
 * open to every crawler, including the AI crawlers.
 *
 * Those are listed explicitly rather than left to the wildcard because the
 * question they answer is the opposite of the usual one: a missing rule reads
 * as "allowed" to a search engine, but several AI vendors treat an explicit
 * allow as the signal that the content may be used in generated answers. Being
 * cited by an assistant is the point, so the permission is stated, not implied.
 */
const aiCrawlers = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'meta-externalagent',
  'Bytespider',
  'CCBot',
];

const disallow = privateRoutes.map((route) => `${route}/`);

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      ...aiCrawlers.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow,
      })),
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
