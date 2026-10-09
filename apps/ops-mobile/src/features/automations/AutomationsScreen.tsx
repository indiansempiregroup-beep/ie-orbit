import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { WorkflowDefinition } from '@ie-orbit/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePlanFeatures } from '../../hooks/useOpsExtended';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { PlanFeature } from '../../utils/planFeatures';
import { getApiErrorMessage } from '../../utils/format';
import { confirmAction } from '../../utils/confirmAction';
import type { RootStackParamList } from '../../navigation/types';

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

export function AutomationsScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();
  const { has } = usePlanFeatures();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const entitled = has(PlanFeature.automations);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WorkflowDefinition[]>([]);
  const [busy, setBusy] = useState(false);
  const [productCode, setProductCode] = useState('shopie');
  const [phase, setPhase] = useState<Phase>('list');
  const [prompt, setPrompt] = useState('');
  const [refineText, setRefineText] = useState('');
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [conversation, setConversation] = useState<Array<{ role: string; content: string }>>([]);

  const load = useCallback(async () => {
    if (!client || !businessId) return;
    setLoading(true);
    try {
      const access = await client.workflow.access({ business_id: businessId });
      setProductCode(access.data.product_code || 'shopie');
      if (access.data.entitled) {
        const list = await client.workflow.listDefinitions({ business_id: businessId });
        setRows(list.data.definitions || []);
      } else {
        setRows([]);
      }
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Failed to load automations'), 'error');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, toast]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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
    if (!client || !businessId) return;
    const text = nextPrompt.trim();
    if (text.length < 8) {
      toast.push('Tell us a bit more about what you want', 'warning');
      return;
    }
    setBusy(true);
    try {
      const nextConversation = [
        ...conversation,
        { role: 'user', content: text },
      ];
      const result = await client.workflow.draftFromPrompt({
        business_id: businessId,
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
      toast.push(getApiErrorMessage(err, "We couldn't understand that yet. Try rephrasing."), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function agreeAndCreate() {
    if (!client || !businessId || !draft) return;
    setBusy(true);
    try {
      await client.workflow.activateDraft({
        business_id: businessId,
        ...draft,
        source_prompt: conversation.map((t) => t.content).join('\n'),
      });
      toast.push('Automation is on.', 'success');
      setPhase('list');
      setDraft(null);
      setExplanation(null);
      await load();
    } catch (err) {
      toast.push(getApiErrorMessage(err, "Couldn't create that automation. Try again."), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: WorkflowDefinition) {
    if (!client || !businessId) return;
    setBusy(true);
    try {
      if (row.status === 'active') {
        await client.workflow.pause(row.id, { business_id: businessId });
      } else {
        await client.workflow.activate(row.id, { business_id: businessId });
      }
      await load();
    } catch (err) {
      toast.push(getApiErrorMessage(err, "Couldn't update this automation. Try again."), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(row: WorkflowDefinition) {
    const ok = await confirmAction({
      title: 'Delete automation?',
      message: `"${row.name}" will be removed permanently.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (ok) {
      await deleteRow(row);
    }
  }

  async function deleteRow(row: WorkflowDefinition) {
    if (!client || !businessId) return;
    setBusy(true);
    try {
      await client.workflow.deleteDefinition(row.id, { business_id: businessId });
      toast.push('Automation removed.', 'success');
      await load();
    } catch (err) {
      toast.push(getApiErrorMessage(err, "Couldn't remove this automation. Try again."), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!entitled) {
    return (
      <FormScreen>
        <EmptyState
          title="Automations not on this plan"
          message="Ask your platform admin to enable Automations on your package, or upgrade to Pro."
          actionLabel="Open subscription"
          onAction={() => navigation.navigate('ProductSettings')}
        />
      </FormScreen>
    );
  }

  if (phase === 'compose') {
    return (
      <FormScreen
        footer={
          <View style={styles.footer}>
            <Button label="Cancel" variant="secondary" onPress={() => setPhase('list')} disabled={busy} />
            <Button
              label="See how it works"
              onPress={() => void generateFromPrompt(prompt)}
              loading={busy}
              disabled={busy || prompt.trim().length < 8}
              style={{ flex: 1 }}
              icon="zap"
            />
          </View>
        }
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Describe freely</Text>
          <Text style={styles.heroTitle}>What should this automation do?</Text>
          <Text style={styles.heroHint}>
            Write it like you would tell a staff member. We’ll turn it into a clear plan you can approve.
          </Text>
        </View>
        <TextInput
          style={styles.textarea}
          multiline
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Example: On pet birthday give 15% off at the counter and online, and notify my staff…"
          placeholderTextColor={colors.mutedForeground}
          autoFocus
        />
        <Text style={styles.section}>Try an example</Text>
        <View style={styles.chipWrap}>
          {EXAMPLE_PROMPTS.map((example) => (
            <Pressable key={example} style={styles.chip} onPress={() => setPrompt(example)}>
              <Text style={styles.chipText}>{example}</Text>
            </Pressable>
          ))}
        </View>
      </FormScreen>
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
      <FormScreen
        footer={
          <View style={styles.footerCol}>
            <Button
              label="Yes, create this"
              onPress={() => void agreeAndCreate()}
              loading={busy}
              disabled={busy}
              fullWidth
              icon="check"
            />
            <Button
              label="Suggest changes"
              variant="secondary"
              onPress={() => setPhase('refine')}
              disabled={busy}
              fullWidth
            />
            <Button label="Start over" variant="ghost" onPress={startCompose} disabled={busy} />
          </View>
        }
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Preview</Text>
          <Text style={styles.heroTitle}>{expl.title || draft.name}</Text>
          <Text style={styles.heroHint}>
            Here’s how it will work. Agree to create it, or tell us what to change.
          </Text>
        </View>

        <View style={styles.previewCard}>
          {steps.map((step) => (
            <View key={step.title} style={styles.previewStep}>
              <View style={styles.previewDot}>
                <Feather name="check" size={12} color={colors.primaryForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewStepTitle}>{step.title}</Text>
                <Text style={styles.previewStepBody}>{step.body}</Text>
              </View>
            </View>
          ))}
          {expl.product_note ? (
            <Text style={styles.productNote}>{expl.product_note}</Text>
          ) : null}
        </View>

        {suggestions.length > 0 ? (
          <>
            <Text style={styles.section}>Quick tweaks</Text>
            <View style={styles.chipWrap}>
              {suggestions.map((item) => (
                <Pressable
                  key={item}
                  style={styles.chip}
                  onPress={() => {
                    setRefineText(item);
                    setPhase('refine');
                  }}
                >
                  <Text style={styles.chipText}>{item}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </FormScreen>
    );
  }

  if (phase === 'refine' && draft) {
    return (
      <FormScreen
        footer={
          <View style={styles.footer}>
            <Button label="Back" variant="secondary" onPress={() => setPhase('preview')} disabled={busy} />
            <Button
              label="Update preview"
              onPress={() => void generateFromPrompt(refineText, draft)}
              loading={busy}
              disabled={busy || refineText.trim().length < 3}
              style={{ flex: 1 }}
            />
          </View>
        }
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Refine</Text>
          <Text style={styles.heroTitle}>What should we change?</Text>
          <Text style={styles.heroHint}>
            Add more detail — discount amount, who it applies to, notifications, dates, and so on.
          </Text>
        </View>
        <TextInput
          style={styles.textarea}
          multiline
          value={refineText}
          onChangeText={setRefineText}
          placeholder="Make it 10% instead, only at POS, and don’t notify the customer…"
          placeholderTextColor={colors.mutedForeground}
          autoFocus
        />
        {suggestions.length > 0 ? (
          <View style={styles.chipWrap}>
            {suggestions.map((item) => (
              <Pressable key={item} style={styles.chip} onPress={() => setRefineText(item)}>
                <Text style={styles.chipText}>{item}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </FormScreen>
    );
  }

  return (
    <FormScreen refreshing={loading} onRefresh={load}>
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>Automation Creator</Text>
        <Text style={styles.heroTitle}>Describe it. Preview it. Then go live.</Text>
        <Text style={styles.heroHint}>
          Tell us what you want in your own words. We’ll show exactly how it works before anything is created.
        </Text>
        <Button label="Create automation" onPress={startCompose} icon="edit-3" />
      </View>

      <Text style={styles.section}>Your automations</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="None yet"
          message="Create one by describing the occasion, offer, and who should get it."
          actionLabel="Create automation"
          onAction={startCompose}
        />
      ) : (
        rows.map((row) => (
          <View key={row.id} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{row.name}</Text>
              <Text style={styles.cardMeta}>
                {row.status} · {(row.trigger as { type?: string })?.type || 'trigger'}
              </Text>
            </View>
            <View style={styles.cardActions}>
              <Pressable onPress={() => void toggle(row)} disabled={busy} hitSlop={8}>
                <Text style={styles.cardAction}>{row.status === 'active' ? 'Pause' : 'Activate'}</Text>
              </Pressable>
              <Pressable onPress={() => void confirmDelete(row)} disabled={busy} hitSlop={8}>
                <Feather name="trash-2" size={16} color={colors.destructive} />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  heroEyebrow: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: fonts.bodySemi,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroTitle: { ...typography.title, color: colors.foreground },
  heroHint: { ...typography.body, color: colors.mutedForeground, marginBottom: spacing.xs },
  section: { ...typography.title, fontFamily: fonts.bodySemi, marginBottom: spacing.sm, marginTop: spacing.sm },
  textarea: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.foreground,
    backgroundColor: colors.card,
    textAlignVertical: 'top',
    ...typography.body,
    marginBottom: spacing.md,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  chipText: { ...typography.caption, color: colors.foreground },
  previewCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  previewStep: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  previewDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  previewStepTitle: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary, textTransform: 'uppercase' },
  previewStepBody: { ...typography.body, color: colors.foreground, marginTop: 2 },
  productNote: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
  footer: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  footerCol: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  cardTitle: { ...typography.body, fontFamily: fonts.bodySemi },
  cardMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardAction: { ...typography.caption, color: colors.primary, fontFamily: fonts.bodySemi },
});
