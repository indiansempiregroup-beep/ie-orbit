import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { RoleMenuCatalogItem, RoleMenuRoleCode } from '@ie-orbit/sdk';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { Chip } from '../../components/ui/Chip';
import { FormSection } from '../../components/ui/FormSection';
import { ScreenState } from '../../components/ScreenState';
import { useToast } from '../../contexts/ToastContext';
import { useRoleMenus } from '../../hooks/useOpsExtended';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import { applyRoleMenuToggle } from '../../utils/roleMenus';
import { bumpRoleMenusRevision } from '../../utils/roleMenusRefresh';

const ROLE_LABELS: Record<RoleMenuRoleCode, string> = {
  business_owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
};

const OWNER_LOCKED = new Set(['home', 'alerts', 'profile', 'settings']);

export function RoleMenusScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { data, loading, reload } = useRoleMenus();
  const [role, setRole] = useState<RoleMenuRoleCode>('staff');
  const [enabled, setEnabled] = useState<Record<string, string[]>>({});
  const enabledRef = useRef<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [booksOpen, setBooksOpen] = useState(false);
  const saveChain = useRef(Promise.resolve());

  useEffect(() => {
    if (data?.enabled && !saving) {
      enabledRef.current = data.enabled;
      setEnabled(data.enabled);
    }
  }, [data?.enabled, saving]);

  const catalog = data?.catalog ?? [];
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);
  const selected = new Set(enabled[role] ?? data?.defaults?.[role] ?? []);

  function toggle(key: string, next: boolean) {
    if (!client || !data || isLocked(role, catalog, key) || saving) return;
    const current = applyRoleMenuToggle(
      enabledRef.current[role] ?? data.enabled?.[role] ?? data.defaults?.[role] ?? [],
      key,
      next,
      catalog,
    );
    const nextEnabled = { ...enabledRef.current, [role]: current };
    enabledRef.current = nextEnabled;
    setEnabled(nextEnabled);
    if (key === 'books' && next) setBooksOpen(true);
    setSaving(true);
    saveChain.current = saveChain.current
      .then(async () => {
        const response = await client.tenants.updateRoleMenus({ enabled: enabledRef.current });
        enabledRef.current = response.data.enabled;
        setEnabled(response.data.enabled);
        bumpRoleMenusRevision();
        await reload();
      })
      .catch((err) => {
        const fallback = data?.enabled ?? {};
        enabledRef.current = fallback;
        setEnabled(fallback);
        toast.push(getApiErrorMessage(err, "Couldn't save role menus."), 'error');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <FormScreen onRefresh={reload} refreshing={loading}>
      <FormHero
        icon="grid"
        title="Role menus"
        subtitle="Choose which menus each role can open. Under Books, turn individual sections on for Manager or Staff. Plan features and permissions still apply."
      />
      <ScreenState loading={loading && !catalog.length} />
      {catalog.length ? (
        <>
          <View style={styles.roles}>
            {(data?.roles ?? (['business_owner', 'manager', 'staff'] as RoleMenuRoleCode[])).map((code) => (
              <Chip
                key={code}
                label={ROLE_LABELS[code] ?? code}
                active={role === code}
                onPress={() => setRole(code)}
              />
            ))}
          </View>
          {groups.map((group) => (
            <FormSection key={group.group} title={group.label}>
              {group.items.map((item) => {
                if (item.parent) return null;
                const children = group.items.filter((child) => child.parent === item.key);
                const locked = isLocked(role, catalog, item.key);
                const on = selected.has(item.key) || locked;
                const inRoleDefault = (data?.defaults?.[role] ?? []).includes(item.key);
                const expandable = children.length > 0;
                return (
                  <View key={item.key}>
                    <View style={styles.row}>
                      {expandable ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ expanded: booksOpen }}
                          accessibilityLabel={booksOpen ? 'Hide Books sections' : 'Show Books sections'}
                          hitSlop={8}
                          onPress={() => setBooksOpen((open) => !open)}
                          style={styles.chevron}
                        >
                          <Feather
                            name={booksOpen ? 'chevron-down' : 'chevron-right'}
                            size={18}
                            color={colors.primary}
                          />
                        </Pressable>
                      ) : null}
                      <Pressable
                        style={styles.copy}
                        disabled={!expandable}
                        onPress={() => setBooksOpen((open) => !open)}
                      >
                        <Text style={styles.label}>{item.label}</Text>
                        {locked ? (
                          <Text style={styles.hint}>Always available</Text>
                        ) : expandable ? (
                          <Text style={styles.hint}>{booksSectionSummary(children, selected, on)}</Text>
                        ) : !inRoleDefault ? (
                          <Text style={styles.hint}>Off by default</Text>
                        ) : null}
                      </Pressable>
                      <Switch
                        value={on}
                        disabled={locked || saving}
                        onValueChange={(value) => void toggle(item.key, value)}
                      />
                    </View>
                    {expandable && booksOpen ? (
                      <View style={styles.childPanel}>
                        {children.map((child) => {
                          const childLocked = isLocked(role, catalog, child.key);
                          const parentOff = !selected.has(item.key) && !childLocked;
                          const childOn = !parentOff && (selected.has(child.key) || childLocked);
                          const childDefault = (data?.defaults?.[role] ?? []).includes(child.key);
                          return (
                            <View key={child.key} style={styles.childRow}>
                              <View style={styles.copy}>
                                <Text style={styles.label}>{child.label}</Text>
                                {parentOff ? (
                                  <Text style={styles.hint}>Turn on Books first</Text>
                                ) : !childDefault ? (
                                  <Text style={styles.hint}>Off by default</Text>
                                ) : null}
                              </View>
                              <Switch
                                value={childOn}
                                disabled={childLocked || saving || parentOff}
                                onValueChange={(value) => void toggle(child.key, value)}
                              />
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </FormSection>
          ))}
        </>
      ) : null}
    </FormScreen>
  );
}

function booksSectionSummary(children: RoleMenuCatalogItem[], selected: Set<string>, booksOn: boolean): string {
  if (!booksOn) return 'Off · tap to view sections';
  const onCount = children.filter((child) => selected.has(child.key)).length;
  if (onCount === children.length) return `All ${children.length} sections · tap to edit`;
  return `${onCount} of ${children.length} sections · tap to edit`;
}

function isLocked(role: RoleMenuRoleCode, catalog: RoleMenuCatalogItem[], key: string): boolean {
  const item = catalog.find((entry) => entry.key === key);
  if (item?.always_on) return true;
  return role === 'business_owner' && OWNER_LOCKED.has(key);
}

function groupCatalog(catalog: RoleMenuCatalogItem[]) {
  const groups: Array<{ group: string; label: string; items: RoleMenuCatalogItem[] }> = [];
  for (const item of catalog) {
    const last = groups[groups.length - 1];
    if (last && last.group === item.group) {
      last.items.push(item);
    } else {
      groups.push({ group: item.group, label: item.group_label || item.group, items: [item] });
    }
  }
  return groups;
}

const styles = StyleSheet.create({
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chevron: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childPanel: {
    marginLeft: spacing.sm,
    marginBottom: spacing.sm,
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.tintStrong,
    backgroundColor: colors.tint,
    borderRadius: 12,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  copy: { flex: 1, minWidth: 0 },
  label: { ...typography.body, color: colors.foreground },
  hint: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
});
