import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Loader2, MessageCircle, Plus, Send, Sparkles, X } from 'lucide-react';
import type {
  AssistantEntityLink,
  AssistantMessage,
  AssistantProposedAction,
  AssistantThread,
  AssistantUsage,
} from '@ie-orbit/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { staffRecordPath } from '../../lib/recordLinks';
import { useAssistantAccessQuery } from './useAssistantAccess';
import { AssistantUpiPaySheet } from './AssistantUpiPaySheet';

const PRODUCT_LABEL: Record<string, string> = {
  shopie: 'Orbit Mart',
  appointie: 'Orbit Appoint',
};

const WORKING_STATUSES = [
  'Working…',
  'Looking that up…',
  'Checking your workspace…',
  'Preparing a reply…',
];

type Props = {
  open: boolean;
  onClose: () => void;
};

function formatInr(paise: number | undefined): string {
  const value = Number(paise || 0) / 100;
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: value % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function usagePrimaryLine(usage: AssistantUsage): string {
  const wallet = formatInr(usage.balance_paise);
  if (usage.using_prepaid_messages || usage.using_prepaid_confirms) {
    return `Using prepaid · Wallet ${wallet} · ${formatInr(usage.message_price_paise)}/msg · ${formatInr(usage.confirm_price_paise)}/confirm`;
  }
  return `Free today: ${usage.messages_remaining} msgs · ${usage.confirms_remaining} confirms · Wallet ${wallet}`;
}

function usageNote(usage: AssistantUsage, blocked: boolean, nearLimit: boolean): string {
  if (blocked) {
    return 'Free limit used · wallet too low. Top up to keep chatting.';
  }
  if (usage.using_prepaid_messages || usage.using_prepaid_confirms) {
    return 'Free daily limit used. This send/confirm will debit your prepaid wallet.';
  }
  if (nearLimit) {
    const canCover =
      Boolean(usage.overage_enabled) &&
      Number(usage.balance_paise || 0) >= Number(usage.message_price_paise || 0);
    return canCover
      ? `Running low — ${usage.messages_remaining} msgs · ${usage.confirms_remaining} confirms left. Wallet will cover after free runs out.`
      : `Running low — ${usage.messages_remaining} msgs · ${usage.confirms_remaining} confirms left today.`;
  }
  return 'Free daily limits for your workspace. Top up anytime for prepaid overage.';
}

function messageLinks(message: AssistantMessage): AssistantEntityLink[] {
  const raw = message.metadata?.links;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (link): link is AssistantEntityLink =>
      Boolean(link && typeof link === 'object' && link.kind && link.id && link.label),
  );
}

/** Drop bullet lines when clickable record cards already show the same rows. */
function assistantMessageBody(content: string, links: AssistantEntityLink[]): string {
  const text = String(content || '').trim();
  if (!text || links.length === 0) return text;
  const kept = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !line.trim().startsWith('•'));
  const cleaned = kept.join('\n').trim();
  return cleaned || text.split('\n')[0]?.trim() || text;
}

function previewQueryForLink(link: AssistantEntityLink): string {
  const action = String(link.action || 'preview').toLowerCase();
  if (action === 'select') {
    return String(link.select_text || link.label || '').trim();
  }
  const kind = String(link.kind || '').trim().toLowerCase();
  // Orders/bookings/returns use human-readable numbers as the label; keep UUID for navigation.
  const preferLabel = kind === 'order' || kind === 'booking' || kind === 'return';
  const raw = preferLabel ? String(link.label || link.id || '') : String(link.id || '');
  const id = raw.trim().replace(/^Open\s+/i, '');
  return `preview ${kind} ${id}`.trim();
}

function AssistantWorkingStatus() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % WORKING_STATUSES.length);
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="assistant-bubble is-assistant" aria-live="polite" aria-busy="true">
      <div className="assistant-working">
        <Loader2 size={14} className="assistant-working-spinner" aria-hidden />
        <div className="assistant-working-copy">
          <strong key={index} className="assistant-working-label">
            {WORKING_STATUSES[index]}
          </strong>
          <span className="assistant-typing" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </div>
  );
}

export function AssistantPanel({ open, onClose }: Props) {
  const client = useApiClient();
  const navigate = useNavigate();
  const { activeBusiness, activeProduct } = useWorkspace();
  const accessQuery = useAssistantAccessQuery(open);
  const [thread, setThread] = useState<AssistantThread | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [booting, setBooting] = useState(false);
  const [usage, setUsage] = useState<AssistantUsage | null>(null);
  const [topUpPaise, setTopUpPaise] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const sendLockRef = useRef(false);
  const sendTextRef = useRef<(text: string) => Promise<void>>(async () => undefined);
  const threadCacheRef = useRef<{ businessId: string; thread: AssistantThread; messages: AssistantMessage[] } | null>(
    null,
  );

  const productLabel = PRODUCT_LABEL[String(activeProduct || '')] || 'Workspace';
  const businessName =
    activeBusiness?.display_name || activeBusiness?.business_name || 'Business';
  const accessSuggestions = accessQuery.data?.suggestions ?? [];
  const canSend = usage == null || Boolean(usage.can_send ?? usage.messages_remaining > 0);
  const canConfirm = usage == null || Boolean(usage.can_confirm ?? usage.confirms_remaining > 0);
  const freeMsgsEmpty = usage != null && usage.messages_remaining <= 0;
  const freeConfirmsEmpty = usage != null && usage.confirms_remaining <= 0;
  const blocked = usage != null && (!canSend || !canConfirm);
  const nearLimit =
    usage != null &&
    !blocked &&
    ((usage.message_limit > 0 && usage.messages_remaining <= 5 && usage.messages_remaining > 0) ||
      (usage.confirm_limit > 0 && usage.confirms_remaining <= 3 && usage.confirms_remaining > 0));
  const usingPrepaid = Boolean(usage?.using_prepaid_messages || usage?.using_prepaid_confirms);
  const usageLine = usage ? usagePrimaryLine(usage) : null;
  const suggestedTops =
    usage?.suggested_top_up_paise?.filter((v) => Number(v) >= 100) ?? [5000, 10000, 25000, 50000];
  const chips = suggestions.length > 0 ? suggestions : accessSuggestions;

  useEffect(() => {
    if (accessQuery.data?.usage) {
      setUsage(accessQuery.data.usage);
    }
  }, [accessQuery.data?.usage]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const businessId = String(activeBusiness?.id || '');
    const cached = threadCacheRef.current;
    if (cached && cached.businessId === businessId && cached.thread?.id) {
      setThread(cached.thread);
      setMessages(cached.messages);
      return;
    }

    let cancelled = false;
    (async () => {
      setBooting(true);
      try {
        setError(null);
        const listed = (await client.assistant.listThreads()).data;
        const latest = listed.threads?.[0];
        let next: AssistantThread;
        if (latest?.id) {
          next = (await client.assistant.getThread(latest.id)).data;
        } else {
          next = (await client.assistant.createThread()).data;
        }
        if (cancelled) return;
        const nextMessages = next.messages ?? [];
        setThread(next);
        setMessages(nextMessages);
        threadCacheRef.current = { businessId, thread: next, messages: nextMessages };
        const lastAssistant = [...nextMessages].reverse().find((msg) => msg.role === 'assistant');
        const saved = lastAssistant?.metadata?.suggestions;
        if (Array.isArray(saved) && saved.length > 0) {
          setSuggestions(saved.filter((item): item is string => typeof item === 'string'));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open Assistant.');
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, client, activeBusiness?.id]);

  useEffect(() => {
    if (suggestions.length === 0 && accessSuggestions.length > 0) {
      setSuggestions(accessSuggestions);
    }
  }, [accessSuggestions, suggestions.length]);

  useEffect(() => {
    if (!open || !thread) return;
    threadCacheRef.current = {
      businessId: String(activeBusiness?.id || ''),
      thread,
      messages,
    };
  }, [open, thread, messages, activeBusiness?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, open]);

  const title = useMemo(() => 'Assistant', []);

  async function startNewChat() {
    setSending(true);
    setError(null);
    try {
      const created = (await client.assistant.createThread()).data;
      setThread(created);
      setMessages(created.messages ?? []);
      setSuggestions(accessSuggestions);
      setDraft('');
      threadCacheRef.current = {
        businessId: String(activeBusiness?.id || ''),
        thread: created,
        messages: created.messages ?? [],
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a new chat.');
    } finally {
      setSending(false);
    }
  }

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !thread || sendLockRef.current || !canSend) return;
    sendLockRef.current = true;
    setSending(true);
    setError(null);
    setDraft('');
    const optimisticId = `local-user-${Date.now()}`;
    const optimistic: AssistantMessage = {
      id: optimisticId,
      role: 'user',
      content: trimmed,
      metadata: {},
      created_at: new Date().toISOString(),
      proposed_action: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const result = (await client.assistant.postMessage(thread.id, { text: trimmed })).data;
      setMessages((prev) => [
        ...prev.filter((msg) => msg.id !== optimisticId),
        result.user_message,
        result.assistant_message,
      ]);
      setSuggestions(result.suggestions ?? chips);
      if (result.usage) setUsage(result.usage);
      void accessQuery.refetch();
    } catch (err) {
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
      setError(err instanceof Error ? err.message : 'Message failed.');
      setDraft(trimmed);
    } finally {
      sendLockRef.current = false;
      setSending(false);
      requestAnimationFrame(() => composerRef.current?.focus());
    }
  }

  sendTextRef.current = sendText;

  async function confirmAction(action: AssistantProposedAction) {
    if (!canConfirm) return;
    setActingId(action.id);
    setError(null);
    try {
      const result = (await client.assistant.confirmAction(action.id)).data;
      setMessages((prev) =>
        prev
          .map((msg) =>
            msg.proposed_action?.id === action.id
              ? { ...msg, proposed_action: result.proposed_action }
              : msg,
          )
          .concat(result.assistant_message),
      );
      if (result.usage) setUsage(result.usage);
      void accessQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirm failed.');
    } finally {
      setActingId(null);
    }
  }

  async function cancelAction(action: AssistantProposedAction) {
    setActingId(action.id);
    setError(null);
    try {
      const result = (await client.assistant.cancelAction(action.id)).data;
      setMessages((prev) =>
        prev
          .map((msg) =>
            msg.proposed_action?.id === action.id
              ? { ...msg, proposed_action: result.proposed_action }
              : msg,
          )
          .concat(result.assistant_message),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed.');
    } finally {
      setActingId(null);
    }
  }

  function handleLink(link: AssistantEntityLink) {
    const action = String(link.action || 'preview').toLowerCase();
    if (action === 'open') {
      const path = staffRecordPath(link.kind, link.id, { orderId: link.order_id });
      if (!path) return;
      onClose();
      navigate(path);
      return;
    }
    const query = previewQueryForLink(link);
    if (query) void sendText(query);
  }

  if (!open) return null;

  return (
    <div className="assistant-root" role="dialog" aria-modal="true" aria-label="Business Assistant">
      <div className="assistant-backdrop" role="presentation" onClick={onClose} />
      <aside className="assistant-panel">
        <header className="assistant-panel-header">
          <div className="assistant-panel-heading">
            <span className="assistant-panel-icon" aria-hidden>
              <Sparkles size={16} />
            </span>
            <div>
              <strong>{title}</strong>
              <p>
                {businessName} · {productLabel}
              </p>
            </div>
          </div>
          <div className="assistant-panel-actions">
            <button type="button" className="assistant-icon-btn" onClick={() => void startNewChat()} aria-label="New chat">
              <Plus size={16} />
            </button>
            <button type="button" className="assistant-icon-btn" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </header>

        {usageLine ? (
          <div
            className={`assistant-usage${nearLimit || usingPrepaid ? ' is-warn' : ''}${blocked ? ' is-blocked' : ''}`}
          >
            <p className="assistant-usage-line">{usageLine}</p>
            <p className="assistant-usage-note">{usage ? usageNote(usage, blocked, nearLimit) : null}</p>
            {blocked || freeMsgsEmpty || freeConfirmsEmpty || usingPrepaid ? (
              <div className="assistant-usage-tops">
                {suggestedTops.slice(0, 4).map((paise) => (
                  <button
                    key={paise}
                    type="button"
                    className="assistant-usage-topup"
                    onClick={() => setTopUpPaise(paise)}
                  >
                    Top up {formatInr(paise)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="assistant-messages">
          {booting && messages.length === 0 ? (
            <div className="assistant-empty">
              <p>Loading chat…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="assistant-empty">
              <MessageCircle size={28} strokeWidth={1.5} />
              <p>Ask about orders, bookings, stock, or customers. Open a record from any reply — this chat stays when you return.</p>
              <div className="assistant-chips">
                {chips.map((chip) => (
                  <button key={chip} type="button" className="assistant-chip" onClick={() => void sendText(chip)}>
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const links = message.role === 'assistant' ? messageLinks(message) : [];
              const body =
                message.role === 'assistant'
                  ? assistantMessageBody(message.content, links)
                  : message.content;
              return (
                <div
                  key={message.id}
                  className={`assistant-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
                >
                  {body ? <p className="assistant-bubble-text">{body}</p> : null}
                  {links.length > 0 ? (
                    <div className="assistant-links">
                      {links.map((link) => (
                        <button
                          key={`${link.kind}-${link.id}-${link.label}`}
                          type="button"
                          className="assistant-link"
                          onClick={() => handleLink(link)}
                        >
                          {String(link.action || 'preview').toLowerCase() === 'open' ? (
                            <ExternalLink size={16} className="assistant-link-icon" />
                          ) : (
                            <MessageCircle size={16} className="assistant-link-icon" />
                          )}
                          <span className="assistant-link-body">
                            <span className="assistant-link-title">
                              {link.badge ? <span className="assistant-link-badge">{link.badge}</span> : null}
                              <strong>{link.label}</strong>
                            </span>
                            {link.subtitle ? <em>{link.subtitle}</em> : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {message.proposed_action?.status === 'pending' ? (
                    <div className="assistant-proposal">
                      <strong>Proposed change</strong>
                      <p>{message.proposed_action.summary}</p>
                      <div className="assistant-proposal-actions">
                        <button
                          type="button"
                          className="assistant-btn primary"
                          disabled={actingId === message.proposed_action.id || !canConfirm}
                          onClick={() => void confirmAction(message.proposed_action!)}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="assistant-btn ghost"
                          disabled={actingId === message.proposed_action.id}
                          onClick={() => void cancelAction(message.proposed_action!)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {message.proposed_action?.status === 'confirmed' ? (
                    <p className="assistant-proposal-done">Confirmed</p>
                  ) : null}
                </div>
              );
            })
          )}
          {sending ? <AssistantWorkingStatus /> : null}
          <div ref={bottomRef} />
        </div>

        {messages.length > 0 && chips.length > 0 ? (
          <div className="assistant-chips bar">
            {chips.slice(0, 4).map((chip) => (
              <button key={chip} type="button" className="assistant-chip" onClick={() => void sendText(chip)}>
                {chip}
              </button>
            ))}
          </div>
        ) : null}

        <button type="button" className="assistant-help-toggle" onClick={() => setHelpOpen((v) => !v)}>
          What can you do?
        </button>
        {helpOpen ? (
          <p className="assistant-help">
            Try “Orders today”, “Low stock”, “Bookings today”, “order #123”, or “mark order 123 as delivered”. Changes
            always need Confirm. Tap any record link in a reply to open it. Daily free limits apply.
          </p>
        ) : null}

        {error ? <p className="assistant-error">{error}</p> : null}

        <div className="assistant-composer-wrap">
          <p className="assistant-composer-hint">
            <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
          </p>
          <form
            className="assistant-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendText(draft);
            }}
          >
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return;
                event.preventDefault();
                void sendTextRef.current(event.currentTarget.value);
              }}
              placeholder={!canSend ? 'Top up to keep chatting' : 'Ask Assistant…'}
              aria-label="Message"
              rows={2}
              disabled={sending || !thread || !canSend}
            />
            <button
              type="submit"
              className="assistant-send"
              disabled={sending || !draft.trim() || !thread || !canSend}
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </aside>
      {topUpPaise != null ? (
        <AssistantUpiPaySheet
          amountPaise={topUpPaise}
          onClose={() => setTopUpPaise(null)}
          onClaimed={async () => {
            await accessQuery.refetch();
          }}
          onError={(message) => setError(message)}
        />
      ) : null}
    </div>
  );
}
