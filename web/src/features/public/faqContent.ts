import {
  asRecord,
  asRecordArray,
  asString,
  asStringArray,
  objectReader,
  readEnglishCatalog,
  type TranslateFn,
} from './translate';

export type FaqAnswer =
  | string
  | {
      paragraphs?: string[];
      bullets?: string[];
    };

export type FaqItem = {
  q: string;
  a: FaqAnswer;
};

export type FaqSection = {
  id: string;
  title: string;
  description?: string;
  items: FaqItem[];
};

export function faqAnswerText(answer: FaqAnswer): string {
  if (typeof answer === 'string') return answer;
  const parts = [...(answer.paragraphs ?? []), ...(answer.bullets ?? [])];
  return parts.join(' ');
}

/** Stable section ids / order. Copy lives in i18n under `public.faq.sections.<id>`. */
export const FAQ_SECTION_IDS = [
  'overview',
  'ai',
  'appoint',
  'mart',
  'gettingStarted',
  'plans',
  'billing',
  'bi',
  'support',
] as const;

function buildFaqSections(read: (key: string) => unknown): FaqSection[] {
  const sections: FaqSection[] = [];
  for (const id of FAQ_SECTION_IDS) {
    const raw = asRecord(read(`public.faq.sections.${id}`));
    if (!raw) continue;
    const items: FaqItem[] = asRecordArray(raw.items).map((item) => {
      const answer = asRecord(item.a);
      return {
        q: asString(item.q),
        a: {
          paragraphs: asStringArray(answer?.paragraphs),
          bullets: asStringArray(answer?.bullets),
        },
      };
    });
    const description = asString(raw.description);
    sections.push({
      id,
      title: asString(raw.title),
      description: description || undefined,
      items: items.filter((item) => item.q),
    });
  }
  return sections;
}

/** Translated FAQ sections for the active language (falls back to English per i18next config). */
export function getFaqSections(t: TranslateFn): FaqSection[] {
  return buildFaqSections(objectReader(t));
}

/** English FAQ (SEO JSON-LD / prerender). Same source as the `en` catalog. */
export const faqSections: FaqSection[] = buildFaqSections(readEnglishCatalog);
