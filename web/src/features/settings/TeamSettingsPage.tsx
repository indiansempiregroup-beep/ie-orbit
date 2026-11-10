import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useSnackbar } from '../../hooks/useSnackbar';
import {
  useAssignMemberRole,
  useCreateStaffInvitation,
  useIamRolesQuery,
  useRemoveMemberRole,
  useRevokeStaffInvitation,
  useStaffInvitationsQuery,
  useTeamMembersQuery,
} from './teamHooks';

const ASSIGNABLE_ROLES = ['manager', 'staff'];

export function TeamSettingsPage() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const membersQuery = useTeamMembersQuery();
  const rolesQuery = useIamRolesQuery();
  const invitationsQuery = useStaffInvitationsQuery();
  const createInvitation = useCreateStaffInvitation();
  const revokeInvitation = useRevokeStaffInvitation();
  const assignRole = useAssignMemberRole();
  const removeRole = useRemoveMemberRole();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'staff'>('staff');

  const assignableRoles = (rolesQuery.data ?? []).filter((role) => ASSIGNABLE_ROLES.includes(role.code));

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Card>
        <p className="public-kicker">{t('settings.team')}</p>
        <h2 style={{ margin: '8px 0' }}>{t('settings.teamPage.title')}</h2>
        <p style={{ color: 'var(--muted-foreground)', marginTop: 0 }}>
          {t('settings.teamPage.lead')}
        </p>

        {membersQuery.isLoading ? (
          <p>{t('settings.teamPage.loadingMembers')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            {(membersQuery.data ?? []).map((member) => (
              <div
                key={member.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 14,
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div>
                  <strong>{member.full_name || member.email}</strong>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{member.email}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {member.roles.map((role) => (
                    <span
                      key={role.code}
                      style={{
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: 13,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {role.name}
                      {ASSIGNABLE_ROLES.includes(role.code) ? (
                        <button
                          type="button"
                          onClick={() =>
                            removeRole.mutate(
                              { userId: member.id, roleCode: role.code },
                              {
                                onSuccess: () => snackbar.push(t('settings.teamPage.roleRemoved'), 'success'),
                                onError: (error: Error) => snackbar.push(error.message, 'error'),
                              },
                            )
                          }
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#1d4ed8' }}
                          aria-label={t('settings.teamPage.removeAria', { role: role.name })}
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {assignableRoles.map((role) => (
                    <Button
                      key={role.code}
                      variant="ghost"
                      onClick={() =>
                        assignRole.mutate(
                          { userId: member.id, roleCode: role.code },
                          {
                            onSuccess: () => snackbar.push(t('settings.teamPage.roleAssigned', { role: role.name }), 'success'),
                            onError: (error: Error) => snackbar.push(error.message, 'error'),
                          },
                        )
                      }
                      disabled={member.roles.some((assigned) => assigned.code === role.code)}
                    >
                      {t('settings.teamPage.addRole', { role: role.name })}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>{t('settings.teamPage.inviteTitle')}</h3>
        <form
          style={{ display: 'grid', gap: 12, maxWidth: 480 }}
          onSubmit={(event) => {
            event.preventDefault();
            createInvitation.mutate(
              { email: inviteEmail, platform_role_code: inviteRole },
              {
                onSuccess: () => {
                  snackbar.push(t('settings.teamPage.inviteSent'), 'success');
                  setInviteEmail('');
                },
                onError: (error) => snackbar.push(error.message, 'error'),
              },
            );
          }}
        >
          <label style={{ display: 'grid', gap: 8 }}>
            <span>{t('common.email')}</span>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder={t('settings.teamPage.emailPlaceholder')}
              required
            />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            <span>{t('settings.teamPage.role')}</span>
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as 'manager' | 'staff')}
              style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}
            >
              <option value="staff">{t('settings.roleMenusPage.staff')}</option>
              <option value="manager">{t('settings.roleMenusPage.manager')}</option>
            </select>
          </label>
          <Button type="submit" variant="primary" disabled={createInvitation.isPending}>
            {createInvitation.isPending ? t('settings.teamPage.sending') : t('settings.teamPage.sendInvite')}
          </Button>
        </form>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>{t('settings.teamPage.pendingTitle')}</h3>
        {invitationsQuery.isLoading ? (
          <p>{t('settings.teamPage.loadingInvites')}</p>
        ) : (invitationsQuery.data ?? []).filter((item) => item.status === 'pending').length === 0 ? (
          <p style={{ color: 'var(--muted-foreground)' }}>{t('settings.teamPage.noPending')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {(invitationsQuery.data ?? [])
              .filter((item) => item.status === 'pending')
              .map((invitation) => (
                <div
                  key={invitation.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div>
                    <strong>{invitation.email}</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>
                      {t('settings.teamPage.expires', {
                        role: invitation.platform_role_code,
                        date: new Date(invitation.expires_at).toLocaleDateString(),
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      revokeInvitation.mutate(invitation.id, {
                        onSuccess: () => snackbar.push(t('settings.teamPage.inviteCancelled'), 'success'),
                        onError: (error: Error) => snackbar.push(error.message, 'error'),
                      })
                    }
                  >
                    {t('settings.teamPage.revoke')}
                  </Button>
                </div>
              ))}
          </div>
        )}
      </Card>

      <Link to="/settings">
        <Button variant="ghost">{t('settings.teamPage.backToSettings')}</Button>
      </Link>
    </div>
  );
}
