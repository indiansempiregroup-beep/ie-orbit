import { type ChangeEvent } from 'react';
import { useBusinessOptions } from '../features/dashboard/dashboardHooks';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { Button } from './Button';

type Props = {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  onClear: () => void;
};

export function ManagementListToolbar({
  searchTerm,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  onClear,
}: Props) {
  const workspace = useWorkspace();
  const businessOptions = useBusinessOptions();
  const businesses = businessOptions.data ?? [];

  function handleBusinessChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextId = event.target.value;
    if (nextId && nextId !== workspace.businessId) {
      workspace.setBusinessId(nextId);
    }
  }

  return (
    <div className="management-list-toolbar">
      <div className="management-list-toolbar__group management-list-toolbar__group--business">
        <select
          className="management-list-toolbar__control management-list-toolbar__select"
          value={workspace.businessId ?? ''}
          onChange={handleBusinessChange}
          disabled={businessOptions.isLoading || businesses.length === 0}
          aria-label="Workspace location"
        >
          {businesses.length === 0 ? (
            <option value="">No businesses</option>
          ) : (
            businesses.map((business) => (
              <option key={business.id} value={business.id}>
                {business.display_name ?? business.business_name ?? business.id}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="management-list-toolbar__group management-list-toolbar__group--search">
        <input
          className="management-list-toolbar__control management-list-toolbar__input"
          type="search"
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel}
        />
      </div>

      <Button type="button" variant="ghost" className="management-list-toolbar__clear" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
