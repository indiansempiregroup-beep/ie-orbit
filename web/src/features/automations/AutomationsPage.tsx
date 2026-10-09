import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WorkflowDefinition } from '@ie-orbit/sdk';
import { Check, Trash2, Zap } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useApiClient } from '../../hooks/useApiClient';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBusinessBillingSnapshotQuery } from '../settings/billingHooks';
import { getApiErrorMessage } from '../../lib/apiClient';
import './automations.css';

type Phase = 'list' | 'compose' | 'preview' | 'refine';

type Explanation = {
  title?: string;
  summary?: string;
  how_it_works?: string;
  product_note?: string;
  steps?: Array<{ title: string; body: string }>;
};

type DraftPayload = {
  name: string;
  description?: string;
  product_code: string;
  trigger: Record<string, unknown>;
  conditions: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
};

const EXAMPLE_PROMPTS = [
  'On pet birthday give 15% off at POS and online, and tell staff',
  'VIP tagged customers always get 10% off at the counter',
  'Customer birthday — suggest 10% off when booking',
  'On 11-01 every year run a 20% festival sale',
];

export function AutomationsPage() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const billingSnapshot = useBusinessBillingSnapshotQuery(workspace.businessId ?? undefined);
  const entitled = useMemo(() => {
    const snapshot = billingSnapshot.data;
    const features = [
      ...((snapshot?.entitled_features as string[] | undefined) ?? []),
      ...((snapshot?.features as string[] | undefined) ?? []),
    ];
    return features.includes('automations');
  }, [billingSnapshot.data]);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WorkflowDefinition[]>([]);
  const [busy, setBusy] = useState(false);
  const [productCode, setProductCode] = useState(workspace.activeProduct || 'shopie');
  const [phase, setPhase] = useState<Phase>('list');
  const [prompt, setPrompt] = useState('');
  const [refineText, setRefineText] = useState('');
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [conversation, setConversation] = useState<Array<{ role: string; content: string }>>([]);

  const load = useCallback(async () => {
    if (!workspace.businessId) return;
    setLoading(true);
    try {
      const access = await client.workflow.access({ business_id: workspace.businessId });
      setProductCode(access.data.product_code || workspace.activeProduct || 'shopie');
      if (access.data.entitled) {
        const list = await client.workflow.listDefinitions({
          business_id: workspace.businessId,
        });
        setRows(list.data.definitions || []);
      } else {
        setRows([]);
      }
    } catch (err) {
      snackbar.push(getApiErrorMessage(err, 'Failed to load automations'), 'error');
    } finally {
      setLoading(false);
    }
  }, [client, snackbar, workspace.activeProduct, workspace.businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  function startCompose() {
    setPrompt('');
    setRefineText('');
    setDraft(null);
    setExplanation(null);
    setSuggestions([]);
    setConversation([]);
    setPhase('compose');
  }

  async function generateFromPrompt(nextPrompt: string, prior?: DraftPayload | null) {
    if (!workspace.businessId) return;
    const text = nextPrompt.trim();
    if (text.length < 8) {
      snackbar.push('Tell us a bit more about what you want', 'error');
      return;
    }
    setBusy(true);
    try {
      const nextConversation = [...conversation, { role: 'user', content: text }];
      const result = await client.workflow.draftFromPrompt({
        business_id: workspace.businessId,
        product_code: productCode,
        prompt: text,
        prior_draft: prior || undefined,
        conversation: nextConversation,
        save_draft: false,
      });
      setDraft(result.data.draft as DraftPayload);
      setExplanation(result.data.explanation || null);
      setSuggestions(result.data.suggestions || []);
      setConversation([
        ...nextConversation,
        {
          role: 'assistant',
          content: result.data.explanation?.how_it_works || result.data.draft.name,
        },
      ]);
      setPhase('preview');
      setRefineText('');
    } catch (err) {
      snackbar.push(getApiErrorMessage(err, "We couldn't understand that yet. Try rephrasing."), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function agreeAndCreate() {
    if (!workspace.businessId || !draft) return;
    setBusy(true);
    try {
      await client.workflow.activateDraft({
        business_id: workspace.businessId,
        ...draft,
        source_prompt: conversation.map((t) => t.content).join('\n'),
      });
      snackbar.push('Automation is on.', 'success');
      setPhase('list');
      setDraft(null);
      setExplanation(null);
      await load();
    } catch (err) {
      snackbar.push(getApiErrorMessage(err, "Couldn't create that automation. Try again."), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: WorkflowDefinition) {
    if (!workspace.businessId) return;
    setBusy(true);
    try {
      if (row.status === 'active') {
        await client.workflow.pause(row.id, { business_id: workspace.businessId });
      } else {
        await client.workflow.activate(row.id, { business_id: workspace.businessId });
      }
      await load();
    } catch (err) {
      snackbar.push(getApiErrorMessage(err, "Couldn't update this automation. Try again."), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(row: WorkflowDefinition) {
    if (!workspace.businessId) return;
    if (!window.confirm(`Delete “${row.name}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await client.workflow.deleteDefinition(row.id, { business_id: workspace.businessId });
      snackbar.push('Automation removed.', 'success');
      await load();
    } catch (err) {
      snackbar.push(getApiErrorMessage(err, "Couldn't remove this automation. Try again."), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!entitled && !billingSnapshot.isLoading) {
    return (
      <div className="page-stack">
        <Card>
          <div className="page-header">
            <h1>
              <Zap size={20} /> Automations
            </h1>
          </div>
          <p className="muted">
            Automations are not included in the current plan. Ask your platform admin to enable them
            on the package, or upgrade to Pro.
          </p>
        </Card>
      </div>
    );
  }

  if (phase === 'compose') {
    return (
      <div className="page-stack auto-wizard">
        <Card className="auto-hero">
          <p className="auto-hero__eyebrow">Describe freely</p>
          <h1>What should this automation do?</h1>
          <p className="muted">
            Write it like you would tell a staff member. We’ll turn it into a clear plan you can
            approve.
          </p>
        </Card>
        <Card>
          <textarea
            className="input auto-textarea"
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Example: On pet birthday give 15% off at the counter and online, and notify my staff…"
            autoFocus
          />
          <p className="auto-section-label">Try an example</p>
          <div className="auto-chips">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                className="auto-chip"
                onClick={() => setPrompt(example)}
              >
                {example}
              </button>
            ))}
          </div>
          <div className="auto-actions">
            <Button type="button" variant="neutral" onClick={() => setPhase('list')} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={busy}
              disabled={busy || prompt.trim().length < 8}
              onClick={() => void generateFromPrompt(prompt)}
            >
              <Zap size={16} /> See how it works
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (phase === 'preview' && draft) {
    const expl = explanation || {
      title: draft.name,
      how_it_works: draft.description || draft.name,
      steps: [{ title: 'How it works', body: draft.description || draft.name }],
    };
    const steps = expl.steps?.length
      ? expl.steps
      : [{ title: 'How it works', body: expl.how_it_works || expl.summary || '' }];
    return (
      <div className="page-stack auto-wizard">
        <Card className="auto-hero">
          <p className="auto-hero__eyebrow">Preview</p>
          <h1>{expl.title || draft.name}</h1>
          <p className="muted">
            Here’s how it will work. Agree to create it, or tell us what to change.
          </p>
        </Card>
        <Card className="auto-preview">
          {steps.map((step) => (
            <div key={step.title} className="auto-preview__step">
              <span className="auto-preview__dot">
                <Check size={12} />
              </span>
              <div>
                <em>{step.title}</em>
                <p>{step.body}</p>
              </div>
            </div>
          ))}
          {expl.product_note ? (
            <p className="muted auto-preview__note">{expl.product_note}</p>
          ) : null}
        </Card>
        {suggestions.length > 0 ? (
          <Card>
            <p className="auto-section-label">Quick tweaks</p>
            <div className="auto-chips">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="auto-chip"
                  onClick={() => {
                    setRefineText(item);
                    setPhase('refine');
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </Card>
        ) : null}
        <Card>
          <div className="auto-actions auto-actions--col">
            <Button type="button" loading={busy} disabled={busy} onClick={() => void agreeAndCreate()}>
              <Check size={16} /> Yes, create this
            </Button>
            <Button type="button" variant="neutral" disabled={busy} onClick={() => setPhase('refine')}>
              Suggest changes
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={startCompose}>
              Start over
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (phase === 'refine' && draft) {
    return (
      <div className="page-stack auto-wizard">
        <Card className="auto-hero">
          <p className="auto-hero__eyebrow">Refine</p>
          <h1>What should we change?</h1>
          <p className="muted">
            Add more detail — discount amount, who it applies to, notifications, dates, and so on.
          </p>
        </Card>
        <Card>
          <textarea
            className="input auto-textarea"
            rows={5}
            value={refineText}
            onChange={(e) => setRefineText(e.target.value)}
            placeholder="Make it 10% instead, only at POS, and don’t notify the customer…"
            autoFocus
          />
          {suggestions.length > 0 ? (
            <div className="auto-chips">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="auto-chip"
                  onClick={() => setRefineText(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
          <div className="auto-actions">
            <Button type="button" variant="neutral" onClick={() => setPhase('preview')} disabled={busy}>
              Back
            </Button>
            <Button
              type="button"
              loading={busy}
              disabled={busy || refineText.trim().length < 3}
              onClick={() => void generateFromPrompt(refineText, draft)}
            >
              Update preview
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-stack auto-wizard">
      <Card className="auto-hero">
        <p className="auto-hero__eyebrow">Automation Creator</p>
        <h1>Describe it. Preview it. Then go live.</h1>
        <p className="muted">
          Tell us what you want in your own words. We’ll show exactly how it works before anything is
          created.
        </p>
        <div className="auto-best__actions">
          <Button type="button" onClick={startCompose}>
            <Zap size={16} /> Create automation
          </Button>
        </div>
      </Card>

      <Card>
        <h2>Your automations</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">
            None yet. Describe an occasion, offer, and who should get it — then approve the preview.
          </p>
        ) : (
          <ul className="auto-list">
            {rows.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.name}</strong>
                  <div className="muted">
                    {row.status} · {(row.trigger as { type?: string })?.type || 'trigger'}
                  </div>
                </div>
                <div className="auto-list__actions">
                  <Button variant="neutral" disabled={busy} onClick={() => void toggle(row)}>
                    {row.status === 'active' ? 'Pause' : 'Activate'}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void deleteRow(row)}
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
