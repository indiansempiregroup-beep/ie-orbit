import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TranslateFn } from '../translate';
import { industryProductLabel, type IndustryContent } from './content';

type BranchLayout = {
  /** Tip point on the illustrated canopy (percent of art frame). */
  left: string;
  top: string;
  side: 'left' | 'right';
  /** Open the hover card above the chip when near the lower canopy. */
  card: 'below' | 'above';
};

/**
 * Tip points on foliage inside the circular orbit frame
 * (`orbit-tree.jpg` with object-fit contain — full tree visible).
 */
const BRANCH_LAYOUT: BranchLayout[] = [
  { left: '50%', top: '14%', side: 'left', card: 'below' },
  { left: '28%', top: '24%', side: 'left', card: 'below' },
  { left: '72%', top: '23%', side: 'right', card: 'below' },
  { left: '18%', top: '40%', side: 'left', card: 'below' },
  { left: '82%', top: '39%', side: 'right', card: 'below' },
  { left: '30%', top: '54%', side: 'left', card: 'above' },
  { left: '70%', top: '53%', side: 'right', card: 'above' },
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reduced;
}

type IndustriesOrbitTreeProps = {
  industries: IndustryContent[];
  translate: TranslateFn;
};

export function IndustriesOrbitTree({ industries, translate }: IndustriesOrbitTreeProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const clearTimerRef = useRef<number | null>(null);
  const [entered, setEntered] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const items = useMemo(() => industries.slice(0, 7), [industries]);
  const activeIndex = items.findIndex((item) => item.slug === activeSlug);
  const activeIndustry = activeIndex >= 0 ? items[activeIndex] : null;
  const activeLayout = activeIndex >= 0 ? BRANCH_LAYOUT[activeIndex] : null;

  const cancelClear = () => {
    if (clearTimerRef.current != null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  };

  const showIndustry = (slug: string) => {
    cancelClear();
    setActiveSlug(slug);
  };

  const scheduleHide = () => {
    cancelClear();
    clearTimerRef.current = window.setTimeout(() => {
      setActiveSlug(null);
      clearTimerRef.current = null;
    }, 100);
  };

  const hideNow = () => {
    cancelClear();
    setActiveSlug(null);
  };

  useEffect(() => {
    if (reducedMotion) {
      setEntered(true);
      return undefined;
    }
    const node = rootRef.current;
    if (!node) return undefined;

    const reveal = () => setEntered(true);
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
      reveal();
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          reveal();
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(node);
    const fallback = window.setTimeout(reveal, 900);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [reducedMotion]);

  useEffect(() => () => cancelClear(), []);

  return (
    <section
      ref={rootRef}
      className={`public-industries-tree${entered || reducedMotion ? ' is-entered' : ''}${
        reducedMotion ? ' is-reduced' : ''
      }${activeSlug ? ' has-active' : ''}`}
      aria-label={t('public.nav.industries')}
      onMouseLeave={hideNow}
    >
      <div className="public-industries-tree__stage">
        <div className="public-industries-tree__frame">
          <div className="public-industries-tree__orbit" aria-hidden="true">
            <span className="public-industries-tree__ring public-industries-tree__ring--outer" />
            <span className="public-industries-tree__ring public-industries-tree__ring--mid" />
            <span className="public-industries-tree__ring public-industries-tree__ring--inner" />
            <div className="public-industries-tree__planet">
              <img
                className="public-industries-tree__art"
                src="/marketing/industries/orbit-tree.jpg"
                alt=""
                decoding="async"
              />
            </div>
          </div>

          {items.map((industry, index) => {
            const layout = BRANCH_LAYOUT[index];
            if (!layout) return null;
            const isActive = activeSlug === industry.slug;
            return (
              <div
                key={industry.slug}
                className={`public-industries-tree__branch public-industries-tree__branch--${layout.side}${
                  isActive ? ' is-active' : ''
                }`}
                style={{
                  left: layout.left,
                  top: layout.top,
                  ['--slot-index' as string]: index,
                }}
                onMouseEnter={() => showIndustry(industry.slug)}
                onMouseLeave={scheduleHide}
                onFocusCapture={() => showIndustry(industry.slug)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    scheduleHide();
                  }
                }}
              >
                <span className="public-industries-tree__name" tabIndex={0}>
                  <span className="public-industries-tree__name-dot" aria-hidden="true" />
                  {industry.name}
                </span>
              </div>
            );
          })}

          {activeIndustry && activeLayout ? (
            <div
              className={`public-industries-tree__detail public-industries-tree__detail--${activeLayout.side} public-industries-tree__detail--${activeLayout.card}`}
              style={{
                left: activeLayout.left,
                top: activeLayout.top,
              }}
              onMouseEnter={() => showIndustry(activeIndustry.slug)}
              onMouseLeave={scheduleHide}
            >
              <div className="public-industries-tree__detail-media">
                <img src={activeIndustry.cardImage} alt="" loading="lazy" />
              </div>
              <div className="public-industries-tree__detail-copy">
                <p className="public-kicker">{industryProductLabel(activeIndustry.products, translate)}</p>
                <strong>{activeIndustry.name}</strong>
                <p>{activeIndustry.lead}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ul className="public-industries-tree__list">
        {items.map((industry) => {
          const open = activeSlug === industry.slug;
          return (
            <li key={industry.slug} className={open ? 'is-open' : undefined}>
              <button
                type="button"
                className="public-industries-tree__list-toggle"
                aria-expanded={open}
                onClick={() => setActiveSlug(open ? null : industry.slug)}
              >
                <span className="public-industries-tree__name-dot" aria-hidden="true" />
                {industry.name}
              </button>
              {open ? (
                <div className="public-industries-tree__list-detail">
                  <img src={industry.cardImage} alt="" loading="lazy" />
                  <p className="public-kicker">{industryProductLabel(industry.products, translate)}</p>
                  <p>{industry.lead}</p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
