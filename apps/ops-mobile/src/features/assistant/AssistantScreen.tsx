import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  AssistantEntityLink,
  AssistantMessage,
  AssistantProposedAction,
  AssistantThread,
  AssistantUsage,
} from '@ie-orbit/sdk';
import { DesktopPage } from '../../components/DesktopPage';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { messageEntityLinks, openAssistantEntityLink, assistantMessageBody, previewQueryForLink } from '../../navigation/assistantLinks';
import type { RootStackParamList } from '../../navigation/types';
import { PlanFeature } from '../../utils/planFeatures';
import { usePlanFeatures } from '../../hooks/useOpsExtended';
import { colors, fonts, radius, shadows, spacing, typography } from '../../theme/tokens';
import { layout } from '../../theme/layout';
import { AssistantUpiPaySheet } from './AssistantUpiPaySheet';
import { useAuth } from '../../contexts/AuthContext';

const WORKING_STATUSES = [
  'Working…',
  'Looking that up…',
  'Checking your workspace…',
  'Preparing a reply…',
];

const PRODUCT_LABEL: Record<string, string> = {
  shopie: 'Orbit Mart',
  appointie: 'Orbit Appoint',
};

function formatInr(paise: number | undefined): string {
  const value = Number(paise || 0) / 100;
  return `₹${value.toFixed(value % 1 ? 2 : 0)}`;
}

function usageShort(usage: AssistantUsage): string {
  const wallet = formatInr(usage.balance_paise);
  if (usage.using_prepaid_messages || usage.using_prepaid_confirms) {
    return `Prepaid · ${wallet} · ${formatInr(usage.message_price_paise)}/msg`;
  }
  return `${usage.messages_remaining} msgs · ${usage.confirms_remaining} confirms · ${wallet}`;
}

function WorkingStatusBubble() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % WORKING_STATUSES.length);
    }, 1800);
    return () => clearInterval(timer);
  }, []);
  return (
    <View style={[styles.row, styles.rowAssistant]} accessibilityLabel={WORKING_STATUSES[index]}>
      <View style={styles.avatar}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
      <View style={[styles.bubble, styles.bubbleAssistant, styles.workingBubble]}>
        <Text style={styles.workingLabel}>{WORKING_STATUSES[index]}</Text>
        <View style={styles.typingDots}>
          <View style={[styles.dot, styles.dot1]} />
          <View style={[styles.dot, styles.dot2]} />
          <View style={[styles.dot, styles.dot3]} />
        </View>
      </View>
    </View>
  );
}

function MessageBubble({
  message,
  actingId,
  onConfirm,
  onCancel,
  onOpenLink,
  onSelectLink,
}: {
  message: AssistantMessage;
  actingId: string | null;
  onConfirm: (action: AssistantProposedAction) => void;
  onCancel: (action: AssistantProposedAction) => void;
  onOpenLink: (link: AssistantEntityLink) => void;
  onSelectLink: (link: AssistantEntityLink) => void;
}) {
  const isUser = message.role === 'user';
  const pending = message.proposed_action?.status === 'pending' ? message.proposed_action : null;
  const confirmed = message.proposed_action?.status === 'confirmed';
  const cancelled = message.proposed_action?.status === 'cancelled';
  const links = !isUser ? messageEntityLinks(message.metadata) : [];
  const body = isUser ? message.content : assistantMessageBody(message.content, links);

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      {!isUser ? (
        <View style={styles.avatar}>
          <Feather name="zap" size={14} color={colors.primary} />
        </View>
      ) : null}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {body ? (
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{body}</Text>
        ) : null}
        {links.length > 0 ? (
          <View style={styles.linkList}>
            {links.map((link) => {
              const action = String(link.action || 'preview').toLowerCase();
              const isOpen = action === 'open';
              return (
                <Pressable
                  key={`${link.kind}-${link.id}-${link.label}`}
                  style={({ pressed }) => [styles.linkChip, pressed && styles.pressed]}
                  onPress={() => (isOpen ? onOpenLink(link) : onSelectLink(link))}
                >
                  <Feather
                    name={isOpen ? 'external-link' : 'info'}
                    size={16}
                    color={colors.primary}
                  />
                  <View style={styles.linkTextWrap}>
                    {link.badge ? (
                      <View style={styles.linkBadge}>
                        <Text style={styles.linkBadgeText}>{link.badge}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.linkLabel}>{link.label}</Text>
                    {link.subtitle ? (
                      <Text style={styles.linkSubtitle} numberOfLines={3}>
                        {link.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  <Feather
                    name={isOpen ? 'chevron-right' : 'message-circle'}
                    size={16}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {pending ? (
          <View style={styles.proposal}>
            <View style={styles.proposalHead}>
              <Feather name="alert-circle" size={14} color={colors.primary} />
              <Text style={styles.proposalLabel}>Needs your confirm</Text>
            </View>
            <Text style={styles.proposalSummary}>{pending.summary}</Text>
            <View style={styles.proposalActions}>
              <Pressable
                style={[styles.btn, styles.btnPrimary, actingId === pending.id && styles.btnBusy]}
                disabled={actingId === pending.id}
                onPress={() => onConfirm(pending)}
              >
                {actingId === pending.id ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.btnPrimaryText}>Confirm</Text>
                )}
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                disabled={actingId === pending.id}
                onPress={() => onCancel(pending)}
              >
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {confirmed ? (
          <View style={styles.statusPill}>
            <Feather name="check-circle" size={12} color="#15803D" />
            <Text style={styles.statusOk}>Confirmed</Text>
          </View>
        ) : null}
        {cancelled ? (
          <View style={styles.statusPill}>
            <Feather name="x-circle" size={12} color={colors.mutedForeground} />
            <Text style={styles.statusMuted}>Cancelled</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDesktop } = useBreakpoint();
  const keyboardHeight = useKeyboardHeight();
  const keyboardOpen = keyboardHeight > 0 && !isDesktop;
  const client = useOpsClient();
  const auth = useAuth();
  const { activeBusiness, activeProduct, tenantId } = useWorkspace();
  const { has } = usePlanFeatures();
  const enabled = has(PlanFeature.shopieAiAssistant) || has(PlanFeature.appointieAiAssistant);

  const [thread, setThread] = useState<AssistantThread | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AssistantUsage | null>(null);
  const [booting, setBooting] = useState(true);
  const [topUpPaise, setTopUpPaise] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const sendLockRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const productLabel = PRODUCT_LABEL[String(activeProduct || '')] || 'Workspace';
  const businessName =
    activeBusiness?.display_name || activeBusiness?.business_name || 'Business';
  const quotaAllowsSend = usage == null || Boolean(usage.can_send ?? usage.messages_remaining > 0);
  const quotaAllowsConfirm = usage == null || Boolean(usage.can_confirm ?? usage.confirms_remaining > 0);
  const nearLimit =
    usage != null &&
    quotaAllowsSend &&
    quotaAllowsConfirm &&
    ((usage.message_limit > 0 && usage.messages_remaining <= 5 && usage.messages_remaining > 0) ||
      (usage.confirm_limit > 0 && usage.confirms_remaining <= 3 && usage.confirms_remaining > 0));
  const blocked = usage != null && (!quotaAllowsSend || !quotaAllowsConfirm);
  const usingPrepaid = Boolean(usage?.using_prepaid_messages || usage?.using_prepaid_confirms);
  const suggestedTops =
    usage?.suggested_top_up_paise?.filter((v) => Number(v) >= 100) ?? [5000, 10000, 25000, 50000];

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (keyboardOpen) {
      const timer = setTimeout(() => scrollToBottom(true), 80);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [keyboardOpen, scrollToBottom]);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length, sending, scrollToBottom]);

  const bootstrap = useCallback(async () => {
    if (!client || !enabled) {
      setBooting(false);
      return;
    }
    setBooting(true);
    setError(null);
    try {
      const access = (await client.assistant.access()).data;
      setSuggestions(access.suggestions ?? []);
      setUsage(access.usage ?? null);
      const listed = (await client.assistant.listThreads()).data;
      const latest = listed.threads?.[0];
      if (latest?.id) {
        const resumed = (await client.assistant.getThread(latest.id)).data;
        setThread(resumed);
        setMessages(resumed.messages ?? []);
        const lastAssistant = [...(resumed.messages ?? [])]
          .reverse()
          .find((msg) => msg.role === 'assistant');
        const savedSuggestions = lastAssistant?.metadata?.suggestions;
        if (Array.isArray(savedSuggestions) && savedSuggestions.length > 0) {
          setSuggestions(savedSuggestions.filter((item): item is string => typeof item === 'string'));
        }
      } else {
        const created = (await client.assistant.createThread()).data;
        setThread(created);
        setMessages(created.messages ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open Assistant.');
    } finally {
      setBooting(false);
    }
  }, [client, enabled, activeBusiness?.id]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const startNewChat = useCallback(async () => {
    if (!client || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = (await client.assistant.createThread()).data;
      setThread(created);
      setMessages(created.messages ?? []);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a new chat.');
    } finally {
      setSending(false);
    }
  }, [client, sending]);

  useLayoutEffect(() => {
    setStackSubtitle(navigation, `${businessName} · ${productLabel}`);
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => void startNewChat()}
          hitSlop={10}
          accessibilityLabel="New chat"
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
        >
          <Feather name="plus" size={22} color={colors.foreground} />
        </Pressable>
      ),
    });
  }, [navigation, businessName, productLabel, startNewChat]);

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!client || !thread || !trimmed || sendLockRef.current || !quotaAllowsSend) return;
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
    scrollToBottom(true);
    try {
      const result = (await client.assistant.postMessage(thread.id, { text: trimmed })).data;
      setMessages((prev) => [
        ...prev.filter((msg) => msg.id !== optimisticId),
        result.user_message,
        result.assistant_message,
      ]);
      setSuggestions(result.suggestions ?? suggestions);
      setUsage(result.usage);
      scrollToBottom(true);
    } catch (err) {
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
      setError(err instanceof Error ? err.message : 'Message failed.');
      setDraft(trimmed);
    } finally {
      sendLockRef.current = false;
      setSending(false);
    }
  }

  async function confirmAction(action: AssistantProposedAction) {
    if (!client || !quotaAllowsConfirm) return;
    setActingId(action.id);
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
      setUsage(result.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirm failed.');
    } finally {
      setActingId(null);
    }
  }

  async function cancelAction(action: AssistantProposedAction) {
    if (!client) return;
    setActingId(action.id);
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

  if (!enabled) {
    return (
      <DesktopPage maxWidth={layout.formMaxWidth}>
        <View style={[styles.screen, styles.centered]}>
          <View style={styles.emptyIcon}>
            <Feather name="zap" size={28} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Assistant unavailable</Text>
          <Text style={styles.muted}>Business Assistant is not enabled on your plan.</Text>
        </View>
      </DesktopPage>
    );
  }

  const canSend = Boolean(draft.trim() && thread && !sending && quotaAllowsSend);

  return (
    <DesktopPage maxWidth={layout.formMaxWidth}>
      <View style={[styles.screen, isDesktop && styles.screenDesktop]}>
      {usage ? (
        <View
          style={[
            styles.usageBar,
            isDesktop && styles.usageBarDesktop,
            (nearLimit || usingPrepaid) && !blocked && styles.usageBarWarn,
            blocked && styles.usageBarBlocked,
          ]}
        >
          <Feather
            name={blocked ? 'alert-triangle' : nearLimit || usingPrepaid ? 'clock' : 'zap'}
            size={13}
            color={blocked ? '#991B1B' : nearLimit || usingPrepaid ? '#92400E' : colors.primary}
          />
          <Text
            style={[
              styles.usageText,
              (nearLimit || usingPrepaid) && !blocked && styles.usageTextWarn,
              blocked && styles.usageTextBlocked,
            ]}
            numberOfLines={1}
          >
            {blocked
              ? 'Free limit used · wallet too low'
              : usingPrepaid
                ? usageShort(usage)
                : usageShort(usage)}
          </Text>
        </View>
      ) : null}

      {usage && (blocked || usingPrepaid || nearLimit) ? (
        <View style={styles.topUpRow}>
          {suggestedTops.slice(0, 3).map((paise) => (
            <Pressable
              key={paise}
              onPress={() => setTopUpPaise(paise)}
              style={({ pressed }) => [styles.topUpChip, pressed && styles.pressed]}
            >
              <Text style={styles.topUpChipText}>Top up {formatInr(paise)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {booting ? (
        <View style={[styles.messages, styles.centered]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={[
            styles.messagesContent,
            messages.length === 0 && styles.messagesContentEmpty,
            keyboardOpen ? { paddingBottom: keyboardHeight + spacing.md } : null,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => {
            if (keyboardOpen || messages.length > 0) scrollToBottom(false);
          }}
        >
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Feather name="zap" size={28} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>How can I help?</Text>
              <Text style={styles.emptyText}>
                Ask about orders, bookings, stock, or customers. Open any record from a reply, then come back — this chat stays here.
              </Text>
              {suggestions.length > 0 ? (
                <View style={styles.chips}>
                  {suggestions.map((chip) => (
                    <Pressable
                      key={chip}
                      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                      onPress={() => void sendText(chip)}
                    >
                      <Feather name="corner-up-right" size={12} color={colors.primary} />
                      <Text style={styles.chipText}>{chip}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                actingId={actingId}
                onConfirm={(action) => void confirmAction(action)}
                onCancel={(action) => void cancelAction(action)}
                onOpenLink={(link) => {
                  openAssistantEntityLink(link, navigation);
                }}
                onSelectLink={(link) => {
                  const query = previewQueryForLink(link);
                  if (query) void sendText(query);
                }}
              />
            ))
          )}
          {sending ? <WorkingStatusBubble /> : null}
        </ScrollView>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Feather name="alert-circle" size={14} color={colors.destructive} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      {messages.length > 0 && suggestions.length > 0 && !keyboardOpen ? (
        <ScrollView
          horizontal
          style={styles.suggestScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestRow}
          keyboardShouldPersistTaps="handled"
        >
          {suggestions.slice(0, 4).map((chip) => (
            <Pressable
              key={chip}
              style={({ pressed }) => [styles.chipCompact, pressed && styles.pressed]}
              onPress={() => void sendText(chip)}
              disabled={sending || !quotaAllowsSend}
            >
              <Text style={styles.chipCompactText} numberOfLines={1}>
                {chip}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View
          style={[
            styles.composer,
            isDesktop && styles.composerDesktop,
            {
              paddingBottom: keyboardOpen
                ? spacing.sm
                : isDesktop
                  ? spacing.lg
                  : Math.max(insets.bottom, spacing.md),
            },
          ]}
        >
          {Platform.OS === 'web' || isDesktop ? (
            <Text style={styles.composerHint}>Enter to send · Shift + Enter for a new line</Text>
          ) : (
            <Text style={styles.composerHint}>Return for a new line · tap ↑ to send</Text>
          )}
          <View style={styles.inputShell}>
            {Platform.OS === 'web'
              ? React.createElement('textarea', {
                  'aria-label': 'Message',
                  value: draft,
                  rows: 2,
                  maxLength: 2000,
                  disabled: sending || !thread || !quotaAllowsSend,
                  placeholder: !quotaAllowsSend ? 'Top up to keep chatting' : 'Ask anything…',
                  style: {
                    flex: 1,
                    width: '100%',
                    minHeight: 40,
                    maxHeight: 120,
                    resize: 'none',
                    border: 'none',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    color: colors.foreground,
                    fontSize: 15,
                    lineHeight: '20px',
                    fontFamily: 'inherit',
                    paddingTop: 10,
                    paddingBottom: 10,
                  },
                  onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
                  onKeyDown: (event: {
                    key: string;
                    shiftKey: boolean;
                    preventDefault: () => void;
                    stopPropagation: () => void;
                    currentTarget: { value: string };
                  }) => {
                    if (event.key !== 'Enter' || event.shiftKey) return;
                    event.preventDefault();
                    event.stopPropagation();
                    void sendText(event.currentTarget.value);
                  },
                })
              : (
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder={!quotaAllowsSend ? 'Top up to keep chatting' : 'Ask anything…'}
                placeholderTextColor={colors.mutedForeground}
                editable={!sending && Boolean(thread) && quotaAllowsSend}
                // Mobile: Return inserts a newline; send only via the ↑ button.
                blurOnSubmit={false}
                returnKeyType="default"
                textAlignVertical="top"
                multiline
                maxLength={2000}
              />
              )}
            <Pressable
              style={[styles.send, !canSend && styles.sendDisabled]}
              disabled={!canSend}
              onPress={() => void sendText(draft)}
              accessibilityLabel="Send"
            >
              <Feather name="arrow-up" size={18} color={colors.primaryForeground} />
            </Pressable>
          </View>
        </View>
      </KeyboardStickyView>
      </View>
      {topUpPaise != null && client && auth.token && tenantId && activeBusiness?.id ? (
        <AssistantUpiPaySheet
          client={client}
          token={auth.token}
          tenantId={tenantId}
          businessId={String(activeBusiness.id)}
          amountPaise={topUpPaise}
          onClose={() => setTopUpPaise(null)}
          onClaimed={async () => {
            try {
              const access = (await client.assistant.access()).data;
              setUsage(access.usage ?? null);
            } catch {
              /* ignore */
            }
          }}
          onError={(message) => setError(message)}
        />
      ) : null}
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenDesktop: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.soft,
  },
  centered: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.72 },
  usageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.secondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  usageBarDesktop: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  topUpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.secondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topUpChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.card,
  },
  topUpChipText: {
    ...typography.caption,
    fontFamily: fonts.sansSemiBold,
    color: colors.foreground,
  },
  usageBarWarn: { backgroundColor: '#FFFBEB', borderBottomColor: '#FDE68A' },
  usageBarBlocked: { backgroundColor: '#FEF2F2', borderBottomColor: '#FECACA' },
  usageText: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    color: colors.secondaryForeground,
  },
  usageTextWarn: { color: '#92400E' },
  usageTextBlocked: { color: '#991B1B' },
  messages: { flex: 1 },
  messagesContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  messagesContentEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.tintStrong,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  emptyTitle: {
    ...typography.title,
    fontFamily: fonts.bodySemi,
    color: colors.foreground,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.tintStrong,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '100%',
  },
  chipText: {
    color: colors.foreground,
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    flexShrink: 1,
  },
  suggestScroll: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: 48,
  },
  suggestRow: {
    flexGrow: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chipCompact: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    maxWidth: 220,
  },
  chipCompactText: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    color: colors.foreground,
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowAssistant: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.tintStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    flexShrink: 0,
  },
  bubble: {
    maxWidth: '85%',
    flexShrink: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  bubbleAssistant: {
    maxWidth: '100%',
    flexGrow: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 6,
  },
  bubbleText: {
    ...typography.body,
    color: colors.foreground,
    lineHeight: 21,
  },
  bubbleTextUser: {
    color: colors.primaryForeground,
  },
  linkList: { marginTop: spacing.sm, gap: spacing.sm },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.tintStrong,
    backgroundColor: colors.secondary,
    minHeight: 72,
  },
  linkTextWrap: { flex: 1, minWidth: 0, gap: 6 },
  linkBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.tintStrong,
  },
  linkBadgeText: {
    fontSize: 11,
    fontFamily: fonts.bodySemi,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  linkLabel: {
    fontSize: 15,
    fontFamily: fonts.bodySemi,
    color: colors.foreground,
    lineHeight: 20,
  },
  linkSubtitle: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.mutedForeground,
    lineHeight: 18,
  },
  typingBubble: { paddingVertical: spacing.md, minWidth: 56 },
  workingBubble: {
    gap: spacing.sm,
    minWidth: 160,
    paddingVertical: spacing.md,
  },
  workingLabel: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    color: colors.foreground,
    lineHeight: 18,
  },
  typingDots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    opacity: 0.35,
  },
  dot1: { opacity: 0.35 },
  dot2: { opacity: 0.55 },
  dot3: { opacity: 0.8 },
  proposal: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.tintStrong,
    gap: spacing.sm,
  },
  proposalHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  proposalLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.primary,
    fontFamily: fonts.bodySemi,
  },
  proposalSummary: { ...typography.body, color: colors.foreground, lineHeight: 20 },
  proposalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  btn: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBusy: { opacity: 0.7 },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.primaryForeground, fontFamily: fonts.bodySemi, fontSize: 13 },
  btnGhost: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  btnGhostText: { color: colors.foreground, fontFamily: fonts.bodySemi, fontSize: 13 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  statusOk: { color: '#15803D', fontSize: 12, fontFamily: fonts.bodySemi },
  statusMuted: { color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.bodySemi },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  error: { flex: 1, color: colors.destructive, fontSize: 12 },
  composer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  composerDesktop: {
    backgroundColor: colors.card,
  },
  composerHint: {
    fontSize: 11,
    fontFamily: fonts.body,
    color: colors.mutedForeground,
    marginBottom: spacing.xs,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.background,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs + 2,
    paddingVertical: spacing.xs + 2,
    minHeight: 48,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.xs + 2,
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 20,
    outlineStyle: 'none' as never,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  sendDisabled: { opacity: 0.35 },
  muted: { ...typography.body, color: colors.mutedForeground, textAlign: 'center' },
});
