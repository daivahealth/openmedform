/**
 * Canonical site identity, shared by every metadata surface (page <head>,
 * robots.txt, sitemap.xml, the OG image and the JSON-LD block) so the product
 * describes itself the same way to search engines, social cards and the LLM
 * crawlers that answer "which clinical form builder should I use".
 *
 * The default is the production domain: overriding it is only for preview and
 * staging deployments, where absolute URLs must point at that deployment.
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://openmedform.daiva.health'
).replace(/\/$/, '');

export const siteName = 'OpenMedForm';

export const siteTagline =
  'Dynamic clinical forms for every EMR, every geography';

/**
 * Kept under ~155 characters so search engines show it whole rather than
 * truncating mid-sentence, and phrased as a plain statement of what the
 * product does — the shape an AI assistant can quote directly.
 */
export const siteDescription =
  'Generate dynamic clinical forms with AI, coded to SNOMED CT, LOINC and ICD-10. Render them natively in React, Angular and Flutter. Own your data as JSON.';

export const siteKeywords = [
  'clinical form builder',
  'AI form generation',
  'EMR forms',
  'EHR forms',
  'medical form builder',
  'SNOMED CT',
  'LOINC',
  'ICD-10',
  'JSON Forms',
  'clinical risk scoring',
  'React form renderer',
  'Angular form renderer',
  'Flutter form renderer',
  'healthcare interoperability',
];

export const githubUrl = 'https://github.com/daivahealth/openmedform';

/**
 * Public non-documentation routes. Documentation routes are enumerated from
 * the filesystem by lib/docs/registry and appended to the sitemap separately.
 */
export const publicRoutes = ['/', '/login', '/signup'] as const;

/**
 * Application routes that sit behind authentication. Listed once and reused by
 * robots.txt, so a new private area is excluded from crawling in one place.
 */
export const privateRoutes = [
  '/dashboard',
  '/forms',
  '/submissions',
  '/settings',
  '/admin',
  '/fill',
  '/auth',
] as const;

/**
 * Questions the landing page answers, in one place because they are rendered
 * twice: as a visible FAQ section and as FAQPage JSON-LD. Search engines
 * require structured data to match content the visitor can actually see, so
 * these must never drift apart.
 *
 * Answers are deliberately short and self-contained — an assistant quoting one
 * in isolation should still say something true and complete.
 */
export const faq = [
  {
    question: 'What is OpenMedForm?',
    answer:
      'OpenMedForm is an open-source, AI-powered clinical form builder. It generates versioned JSON form schemas from a prompt or an uploaded PDF, renders them natively inside an EMR or EHR, and scores clinical risk assessments server-side.',
  },
  {
    question: 'How does OpenMedForm integrate with an EMR?',
    answer:
      'Install the React, Angular or Flutter renderer package, load the form JSON, and the form appears as a native screen in your product. No form engineering is required, and the same schema also renders to a print-accurate A4 document and PDF.',
  },
  {
    question: 'Which clinical terminologies does OpenMedForm support?',
    answer:
      'AI maps fields and answer options to SNOMED CT, LOINC and ICD-10 codes. Clinicians review and approve those codes in a built-in dictionary, and the approved codes are stored in the form schema itself.',
  },
  {
    question: 'Where is form data stored?',
    answer:
      'Form schemas and submissions are plain JSON, so they can be kept in your own database. Scores are recalculated on the server at submission time rather than trusted from the client.',
  },
  {
    question: 'Is OpenMedForm an EMR or a clinical decision support system?',
    answer:
      'No. OpenMedForm sits alongside an EMR as a form authoring, rendering and submission layer. It calculates clinical risk scores but does not issue treatment recommendations.',
  },
] as const;
