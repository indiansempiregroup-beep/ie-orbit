import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import type { DisplayFeatureGroup } from '../../config/planFeatures';

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
      {groups.map((group) => (
        <div key={group.title} className="public-plan-features__group">
          <p className="public-plan-features__title">{group.title}</p>
          <ul className="public-plan-features__list">
            {group.items.map((item) => (
              <li key={item.code} className="public-plan-features__item">
                <span className="public-plan-features__label">{item.label}</span>
                {item.detail ? <FeatureHint label={item.label} detail={item.detail} /> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
