import { type ChangeEvent, type CSSProperties, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useBusinessOptions } from '../features/dashboard/dashboardHooks';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { Select } from './Select';

type Props = {
  label?: string;
  className?: string;
  /** Controlled value for forms; when omitted, switches the active workspace business. */
  value?: string;
  onChange?: (businessId: string) => void;
  showManageLink?: boolean;
  /** Inline toolbar style aligned with search inputs. */
  variant?: 'default' | 'toolbar';
  fieldStyle?: CSSProperties;
  style?: CSSProperties;
};

export function BusinessWorkspaceSelect({
  label,
  value,
  onChange,
  showManageLink = true,
  variant = 'default',
  fieldStyle,
  style,
}: Props) {
  const workspace = useWorkspace();
  const businessOptions = useBusinessOptions();

  const businesses = businessOptions.data ?? [];
  const selectedId = value ?? workspace.businessId ?? '';

  const options = useMemo(() => {
    if (businesses.length === 0) {
      return [{ value: '', label: 'No businesses yet' }];
    }
    return businesses.map((business) => ({
      value: business.id ?? '',
      label: business.display_name ?? business.business_name ?? business.id ?? 'Unnamed',
    }));
  }, [businesses]);

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextId = event.target.value;
    if (!nextId) return;

    if (onChange) {
      onChange(nextId);
      return;
    }

    if (nextId !== workspace.businessId) {
      workspace.setBusinessId(nextId);
    }
  }

  const isToolbar = variant === 'toolbar';
  const visibleLabel = isToolbar || !showManageLink ? undefined : label;
  const ariaLabel = visibleLabel ? undefined : label ?? 'Workspace location';

  return (
    <div
      style={{
        flexShrink: 0,
        width: isToolbar ? 240 : undefined,
        ...style,
      }}
    >
      <Select
        label={visibleLabel}
        aria-label={ariaLabel}
        compact={isToolbar || !showManageLink || !visibleLabel}
        options={options}
        value={selectedId}
        onChange={handleChange}
        disabled={businessOptions.isLoading || businesses.length === 0}
        style={{
          marginBottom: showManageLink ? 4 : 0,
          minWidth: isToolbar ? 240 : 220,
          width: '100%',
          ...(isToolbar ? fieldStyle : {}),
        }}
      />
      {showManageLink ? (
        <Link to="/settings/business" style={{ fontSize: 12, color: '#6b7280' }}>
          Manage businesses
        </Link>
      ) : null}
    </div>
  );
}
