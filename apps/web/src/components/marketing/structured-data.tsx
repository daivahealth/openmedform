import {
  faq,
  githubUrl,
  siteDescription,
  siteName,
  siteUrl,
} from '@/lib/site';

/**
 * Schema.org JSON-LD for the landing page.
 *
 * This is the machine-readable version of the pitch: it is what lets a search
 * engine or an assistant state the product's name, category, licence and
 * platform without inferring them from marketing prose. The FAQ entries mirror
 * questions the page already answers, in the short, self-contained form that
 * gets quoted into AI answers and rich results.
 */
const schema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': `${siteUrl}/#software`,
      name: siteName,
      description: siteDescription,
      url: siteUrl,
      applicationCategory: 'HealthApplication',
      applicationSubCategory: 'Clinical form builder',
      operatingSystem: 'Web, iOS, Android',
      softwareHelp: githubUrl,
      featureList: [
        'AI form generation from a prompt, PDF or image',
        'SNOMED CT, LOINC and ICD-10 clinical coding',
        'React, Angular and Flutter form renderers',
        'Server-side clinical risk scoring',
        'Immutable versioned JSON form schemas',
        'Print-accurate A4 and PDF output',
      ],
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free to start. No credit card required.',
      },
      publisher: { '@id': `${siteUrl}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'Daiva Health',
      url: 'https://daiva.health',
      sameAs: [githubUrl, 'https://github.com/daivahealth'],
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: siteName,
      url: siteUrl,
      description: siteDescription,
      publisher: { '@id': `${siteUrl}/#organization` },
    },
    {
      '@type': 'FAQPage',
      '@id': `${siteUrl}/#faq`,
      mainEntity: faq.map((entry) => ({
        '@type': 'Question',
        name: entry.question,
        acceptedAnswer: { '@type': 'Answer', text: entry.answer },
      })),
    },
  ],
};

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output of a module-local constant: no user input reaches
      // this, and Next requires raw injection for a JSON-LD script body.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
