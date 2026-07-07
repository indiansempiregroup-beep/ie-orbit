import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { GETTING_STARTED_ITEMS, GETTING_STARTED_KEY } from '../../config/onboarding';

function loadCompleted(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GETTING_STARTED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCompleted(state: Record<string, boolean>) {
  try {
    localStorage.setItem(GETTING_STARTED_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

type GettingStartedChecklistProps = {
  onDismiss?: () => void;
};

export function GettingStartedChecklist({ onDismiss }: GettingStartedChecklistProps) {
  const [completed, setCompleted] = useState<Record<string, boolean>>(loadCompleted);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('ie:onboarding:welcome-dismissed') === 'true';
    } catch {
      return false;
    }
  });

  const progress = useMemo(() => {
    const done = GETTING_STARTED_ITEMS.filter((item) => completed[item.id]).length;
    return Math.round((done / GETTING_STARTED_ITEMS.length) * 100);
  }, [completed]);

  function toggleItem(id: string) {
    setCompleted((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveCompleted(next);
      return next;
    });
  }

  function handleDismiss() {
    try {
      localStorage.setItem('ie:onboarding:welcome-dismissed', 'true');
      localStorage.removeItem('ie:onboarding:show-welcome');
    } catch {
      // ignore
    }
    setDismissed(true);
    onDismiss?.();
  }

  if (dismissed) return null;

  return (
    <Card aria-labelledby="getting-started-title">
      <div className="getting-started-header">
        <div>
          <p className="public-kicker">Welcome wizard</p>
          <h2 id="getting-started-title" style={{ margin: '4px 0' }}>Getting started</h2>
          <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>{progress}% complete</p>
        </div>
        <Button variant="ghost" type="button" onClick={handleDismiss} aria-label="Dismiss getting started checklist">
          Dismiss
        </Button>
      </div>
      <div
        className="getting-started-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Getting started progress"
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <ul className="getting-started-list">
        {GETTING_STARTED_ITEMS.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={Boolean(completed[item.id])}
                onChange={() => toggleItem(item.id)}
              />
              <span>{item.label}</span>
            </label>
            <Link to={item.path}>Open</Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
