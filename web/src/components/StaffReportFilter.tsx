import { StaffTypeahead } from '../features/management/EntityPickers';

type Props = {
  staffId: string | null;
  onChange: (staffId: string | null) => void;
};

/** Report staff filter: server-search typeahead (no full staff dump). */
export function StaffReportFilter({ staffId, onChange }: Props) {
  return (
    <label style={{ display: 'grid', gap: 6, minWidth: 0, width: '100%', maxWidth: 320 }}>
      <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Staff</span>
      <StaffTypeahead
        value={staffId}
        onChange={(id) => onChange(id)}
        placeholder="All staff"
        emptyOptionLabel="All staff"
        ariaLabel="Filter reports by staff"
      />
    </label>
  );
}
