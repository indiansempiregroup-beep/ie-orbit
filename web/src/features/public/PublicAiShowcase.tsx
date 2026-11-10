import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, MessageSquareText, ScanLine, Sparkles, type LucideIcon } from 'lucide-react';
import { Button } from '../../components/Button';
import { trackEvent } from '../../seo/analytics';
import { TRIAL_DAYS } from '../../seo/config';
import { registerStartPath } from '../onboarding/affiliateCode';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';

type AiHighlight = {
  kicker: string;
  title: string;
  prompt: string;
  body: string;
  icon: LucideIcon;
  tone: 'blue' | 'peach' | 'yellow';
};

export function PublicAiShowcase({ id = 'ai', showCta = false }: { id?: string; showCta?: boolean }) {
  const { t } = useTranslation();

  const highlights: AiHighlight[] = useMemo(
    () => [
      {
        kicker: t('public.ai.assistantKicker'),
        title: t('public.ai.assistantTitle'),
        prompt: t('public.ai.assistantPrompt'),
        body: t('public.ai.assistantBody'),
        icon: MessageSquareText,
        tone: 'blue',
      },
      {
        kicker: t('public.ai.autoKicker'),
        title: t('public.ai.autoTitle'),
        prompt: t('public.ai.autoPrompt'),
        body: t('public.ai.autoBody'),
        icon: Sparkles,
        tone: 'peach',
      },
      {
        kicker: t('public.ai.invoiceKicker'),
        title: t('public.ai.invoiceTitle'),
        prompt: t('public.ai.invoicePrompt'),
        body: t('public.ai.invoiceBody'),
        icon: ScanLine,
        tone: 'yellow',
      },
    ],
    [t],
  );

  return (
    <section className="public-ai-band" id={id} aria-labelledby={`${id}-title`}>
      <div className="public-path-inner">
        <div className="public-section-intro">
          <div>
            <p className="public-kicker">{t('public.ai.kicker')}</p>
            <h2 id={`${id}-title`}>
              {t('public.ai.titleBefore')} <em>{t('public.ai.titleEm')}</em>
            </h2>
          </div>
          <p>{t('public.ai.lead')}</p>
        </div>
        <div className="public-ai-grid">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.kicker} className={`public-card public-ai-card public-card--${item.tone}`}>
                <div className="public-card-icon">
                  <Icon size={20} aria-hidden="true" />
                </div>
                <p className="public-kicker">{item.kicker}</p>
                <h3>{item.title}</h3>
                <p className="public-ai-prompt">
                  <span>{t('public.ai.askOrbit')}</span>
                  {item.prompt}
                </p>
                <p className="public-ai-body">{item.body}</p>
              </article>
            );
          })}
        </div>
        {showCta ? (
          <div className="public-ai-actions">
            <Link
              to={registerStartPath()}
              state={REGISTER_FRESH_START_STATE}
              onClick={() => trackEvent('generate_lead', { method: 'home_ai_showcase' })}
            >
              <Button variant="primary">
                {t('public.tryDays', { days: TRIAL_DAYS })} <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </Link>
            <Link to="/features#ai" className="public-signin-link">
              {t('public.ai.seePlans')}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
