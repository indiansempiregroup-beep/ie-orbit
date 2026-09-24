import { useId, useState } from 'react';
import { Info, Sparkles } from 'lucide-react';
import type { DisplayFeatureGroup } from '../../config/planFeatures';

function isAiFeature(code: string) {
  return code.includes('ai_assistant');
}

function FeatureHint({ label, detail }: { label: string; detail: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className={`public-plan-features__hint${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="public-plan-features__info"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`About ${label}`}
        onClick={() => setOpen((value) => !value)}
        onBlur={() => setOpen(false)}
      >
        <Info size={14} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <span id={id} role="tooltip" className="public-plan-features__tip">
        {detail}
      </span>
    </span>
  );
}

export function PlanFeatureList({ groups }: { groups: DisplayFeatureGroup[] }) {
  return (
    <div className="public-plan-features">
      {groups.map((group) => {
        const aiGroup = group.title === 'AI Assistant' || group.items.some((item) => isAiFeature(item.code));
        return (
          <div
            key={group.title}
            className={`public-plan-features__group${aiGroup ? ' is-ai' : ''}`}
          >
            <p className="public-plan-features__title">
              {aiGroup ? (
                <span className="public-plan-features__title-ai">
                  <Sparkles size={12} strokeWidth={2.4} aria-hidden="true" />
                  {group.title}
                </span>
              ) : (
                group.title
              )}
            </p>
            <ul className="public-plan-features__list">
              {group.items.map((item) => {
                const ai = isAiFeature(item.code);
                return (
                  <li
                    key={item.code}
                    className={`public-plan-features__item${ai ? ' is-ai' : ''}`}
                  >
                    {ai ? (
                      <span className="public-plan-features__ai-badge" aria-hidden="true">
                        <span className="public-plan-features__ai-orb" />
                        <span className="public-plan-features__ai-text">AI</span>
                      </span>
                    ) : null}
                    <span className="public-plan-features__label">{item.label}</span>
                    {item.detail ? <FeatureHint label={item.label} detail={item.detail} /> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
