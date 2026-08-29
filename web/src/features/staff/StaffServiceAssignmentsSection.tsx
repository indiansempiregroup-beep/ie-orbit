import React, { useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useServiceList } from '../management/managementHooks';
import { useStaffAssignmentMutations, useStaffAssignments } from './staffAvailabilityHooks';

type StaffServiceAssignmentsSectionProps = {
  staffId: string;
};

export function StaffServiceAssignmentsSection({ staffId }: StaffServiceAssignmentsSectionProps) {
  const assignmentsQuery = useStaffAssignments(staffId);
  const servicesQuery = useServiceList();
  const mutations = useStaffAssignmentMutations();
  const [serviceId, setServiceId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const assignedIds = useMemo(
    () => new Set((assignmentsQuery.data ?? []).map((row) => row.service)),
    [assignmentsQuery.data],
  );
  const availableServices = (servicesQuery.data ?? []).filter((service) => !assignedIds.has(service.id));
  const serviceName = useMemo(() => {
    const map = new Map((servicesQuery.data ?? []).map((service) => [service.id, service.name ?? service.id]));
    return (id: string) => map.get(id) ?? id;
  }, [servicesQuery.data]);

  return (
    <Card style={{ display: 'grid', gap: 16 }}>
      <div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Assigned services</p>
        <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
          Once a staff member has assigned services, they can only be booked for those services. Timeslots and booking create both enforce this.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 6, flex: 1, minWidth: 220 }}>
          Service
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
          >
            <option value="">Select service</option>
            {availableServices.map((service) => (
              <option key={service.id} value={service.id}>{service.name ?? service.id}</option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="primary"
          disabled={!serviceId || mutations.create.isPending}
          onClick={() => {
            setError(null);
            mutations.create.mutate(
              { staff: staffId, service: serviceId, is_active_assignment: true },
              {
                onSuccess: () => {
                  setServiceId('');
                  assignmentsQuery.refetch();
                },
                onError: (err) => setError(err.message),
              },
            );
          }}
        >
          {mutations.create.isPending ? 'Assigning…' : 'Assign service'}
        </Button>
      </div>

      <div style={{ display: 'grid', gap: 1, borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
        {assignmentsQuery.isLoading ? (
          <div style={{ padding: 20, textAlign: 'center' }}>Loading assignments…</div>
        ) : (assignmentsQuery.data ?? []).length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>No services assigned yet.</div>
        ) : (
          (assignmentsQuery.data ?? []).map((row) => (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr auto auto',
                gap: 12,
                padding: '12px 16px',
                background: '#fff',
                alignItems: 'center',
              }}
            >
              <span>{serviceName(row.service)}</span>
              <span>{row.is_active_assignment === false ? 'Inactive' : 'Active'}</span>
              <Button
                type="button"
                variant="neutral"
                disabled={mutations.patch.isPending}
                onClick={() =>
                  mutations.patch.mutate(
                    {
                      assignmentId: row.id,
                      input: { is_active_assignment: row.is_active_assignment === false },
                    },
                    { onSuccess: () => assignmentsQuery.refetch() },
                  )
                }
              >
                {row.is_active_assignment === false ? 'Activate' : 'Deactivate'}
              </Button>
              <Button
                type="button"
                variant="neutral"
                disabled={mutations.remove.isPending}
                onClick={() => mutations.remove.mutate(row.id, { onSuccess: () => assignmentsQuery.refetch() })}
              >
                Remove
              </Button>
            </div>
          ))
        )}
      </div>
      {error ? <div style={{ color: '#dc2626' }}>{error}</div> : null}
    </Card>
  );
}
