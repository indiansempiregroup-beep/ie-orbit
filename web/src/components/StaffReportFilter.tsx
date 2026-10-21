import type { StaffMember } from '@ie-orbit/sdk';

type Props = {
  staff: StaffMember[];
  staffId: string | null;
  onChange: (staffId: string | null) => void;
};

function staffLabel(member: StaffMember) {
  return member.display_name || member.full_name || member.first_name || 'Staff';
}

export function StaffReportFilter({ staff, staffId, onChange }: Props) {
  if (!staff.length) return null;
  return (
    <label style={{ display: 'grid', gap: 6, minWidth: 0, width: '100%', maxWidth: 320 }}>
      <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Staff</span>
      <select
        value={staffId ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        aria-label="Filter reports by staff"
        style={{
          width: '100%',
          borderRadius: 12,
          border: '1px solid var(--border, #e5e7eb)',
          padding: '10px 12px',
          background: '#fff',
          color: 'inherit',
        }}
      >
        <option value="">All staff</option>
        {staff.map((member) => (
          <option key={member.id} value={member.id}>
            {staffLabel(member)}
          </option>
        ))}
      </select>
    </label>
  );
}
