import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { RoleMenuCatalogItem, RoleMenuRoleCode } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useRoleMenusQuery, useUpdateRoleMenus } from '../../hooks/useRoleMenus';
import { applyRoleMenuToggle } from '../../utils/roleMenus';

const ROLE_LABEL_KEYS: Record<RoleMenuRoleCode, string> = {
  business_owner: 'settings.roleMenusPage.owner',
  manager: 'settings.roleMenusPage.manager',
  staff: 'settings.roleMenusPage.staff',
};

const OWNER_LOCKED = new Set(['home', 'alerts', 'profile', 'settings']);

export function RoleMenusPage() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const query = useRoleMenusQuery();
  const update = useUpdateRoleMenus();
  const [role, setRole] = useState<RoleMenuRoleCode>('staff');
  const catalog = query.data?.catalog ?? [];
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const draftRef = useRef<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [booksOpen, setBooksOpen] = useState(false);
  const enabled = Object.keys(draft).length ? draft : (query.data?.enabled ?? {});
  const selected = new Set(enabled[role] ?? query.data?.defaults?.[role] ?? []);

  useEffect(() => {
    if (query.data?.enabled && !saving) {
      draftRef.current = query.data.enabled;
      setDraft(query.data.enabled);
    }
  }, [query.data?.enabled, saving]);

  async function toggle(key: string, next: boolean) {
    if (!query.data || isLocked(role, catalog, key) || saving) return;
    const base = draftRef.current;
    const current = applyRoleMenuToggle(
      base[role] ?? query.data.enabled?.[role] ?? query.data.defaults?.[role] ?? [],
      key,
      next,
      catalog,
    );
    const nextEnabled = { ...base, [role]: current };
    draftRef.current = nextEnabled;
    setDraft(nextEnabled);
    if (key === 'books' && next) setBooksOpen(true);
    setSaving(true);
    try {
      await update.mutateAsync(nextEnabled);
      snackbar.push(t('settings.roleMenusPage.saved'), 'success');
    } catch {
      const fallback = query.data?.enabled ?? {};
      draftRef.current = fallback;
      setDraft(fallback);
      snackbar.push(t('settings.roleMenusPage.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (query.isLoading && !query.data) {
    return <p>{t('settings.roleMenusPage.loading')}</p>;
  }

  if (!query.data?.can_manage) {
    return (
      <Card>
        <h2 style={{ margin: '8px 0' }}>{t('settings.roleMenus')}</h2>
        <p style={{ color: 'var(--muted-foreground)' }}>{t('settings.roleMenusPage.ownerOnly')}</p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Card>
        <p className="public-kicker">{t('settings.team')}</p>
        <h2 style={{ margin: '8px 0' }}>{t('settings.roleMenus')}</h2>
        <p style={{ color: 'var(--muted-foreground)', marginTop: 0 }}>
          {t('settings.roleMenusPage.lead')}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {(query.data?.roles ?? (['business_owner', 'manager', 'staff'] as RoleMenuRoleCode[])).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setRole(code)}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: role === code ? '#163a47' : 'transparent',
                color: role === code ? '#fff' : 'inherit',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {ROLE_LABEL_KEYS[code] ? t(ROLE_LABEL_KEYS[code]) : code}
            </button>
          ))}
        </div>
      </Card>

      {query.isLoading ? <p>{t('settings.roleMenusPage.loading')}</p> : null}

      {groups.map((group) => (
        <Card key={group.group}>
          <h3 style={{ marginTop: 0 }}>{group.label}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {group.items.map((item) => {
              if (item.parent) return null;
              const children = group.items.filter((child) => child.parent === item.key);
              const locked = isLocked(role, catalog, item.key);
              const on = selected.has(item.key) || locked;
              const inRoleDefault = (query.data?.defaults?.[role] ?? []).includes(item.key);
              const expandable = children.length > 0;
              return (
                <div key={item.key}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                      {expandable ? (
                        <button
                          type="button"
                          aria-expanded={booksOpen}
                          aria-label={booksOpen ? t('settings.roleMenusPage.hideBooks') : t('settings.roleMenusPage.showBooks')}
                          onClick={() => setBooksOpen((open) => !open)}
                          style={{
                            border: 0,
                            background: 'transparent',
                            color: 'var(--primary, #163a47)',
                            fontSize: 16,
                            lineHeight: 1,
                            padding: '4px 0',
                            cursor: 'pointer',
                          }}
                        >
                          {booksOpen ? '▾' : '▸'}
                        </button>
                      ) : null}
                      <span>
                        <strong>{item.label}</strong>
                        {locked ? (
                          <span style={{ display: 'block', color: 'var(--muted-foreground)', fontSize: 13 }}>
                            {t('settings.roleMenusPage.alwaysAvailable')}
                          </span>
                        ) : expandable ? (
                          <button
                            type="button"
                            onClick={() => setBooksOpen((open) => !open)}
                            style={{
                              display: 'block',
                              border: 0,
                              background: 'transparent',
                              color: 'var(--muted-foreground)',
                              fontSize: 13,
                              padding: 0,
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            {booksSectionSummary(children, selected, on, t)}
                          </button>
                        ) : !inRoleDefault ? (
                          <span style={{ display: 'block', color: 'var(--muted-foreground)', fontSize: 13 }}>
                            {t('settings.roleMenusPage.offByDefault')}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={locked || saving}
                      onChange={(event) => void toggle(item.key, event.target.checked)}
                    />
                  </div>
                  {expandable && booksOpen ? (
                    <div
                      style={{
                        margin: '0 0 8px 8px',
                        paddingLeft: 12,
                        borderLeft: '2px solid var(--border)',
                      }}
                    >
                      {children.map((child) => {
                        const childLocked = isLocked(role, catalog, child.key);
                        const parentOff = !selected.has(item.key) && !childLocked;
                        const childOn = !parentOff && (selected.has(child.key) || childLocked);
                        const childDefault = (query.data?.defaults?.[role] ?? []).includes(child.key);
                        return (
                          <label
                            key={child.key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 12,
                              padding: '8px 0',
                              borderBottom: '1px solid var(--border)',
                            }}
                          >
                            <span>
                              <strong>{child.label}</strong>
                              {parentOff ? (
                                <span style={{ display: 'block', color: 'var(--muted-foreground)', fontSize: 13 }}>
                                  {t('settings.roleMenusPage.turnOnBooksFirst')}
                                </span>
                              ) : !childDefault ? (
                                <span style={{ display: 'block', color: 'var(--muted-foreground)', fontSize: 13 }}>
                                  {t('settings.roleMenusPage.offByDefault')}
                                </span>
                              ) : null}
                            </span>
                            <input
                              type="checkbox"
                              checked={childOn}
                              disabled={childLocked || saving || parentOff}
                              onChange={(event) => void toggle(child.key, event.target.checked)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

function booksSectionSummary(
  children: RoleMenuCatalogItem[],
  selected: Set<string>,
  booksOn: boolean,
  t: TFunction,
): string {
  if (!booksOn) return t('settings.roleMenusPage.summaryOff');
  const onCount = children.filter((child) => selected.has(child.key)).length;
  if (onCount === children.length) return t('settings.roleMenusPage.summaryAll', { count: children.length });
  return t('settings.roleMenusPage.summarySome', { on: onCount, total: children.length });
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
    if (last && last.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, label: item.group_label || item.group, items: [item] });
  }
  return groups;
}

export default RoleMenusPage;
