import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PICKER_PAGE_SIZE, type Service } from '@ie-orbit/sdk';
import { useDebounce } from '../../hooks/useDebounce';
import { useServiceList } from '../management/managementHooks';
import {
  compactServiceSummary,
  serviceDurationMinutes,
  servicesTotalDurationMinutes,
} from './bookingHelpers';

type Props = {
  /** Currently chosen services (kept by the parent so they survive new searches). */
  selectedServices: Service[];
  onChange: (services: Service[]) => void;
  nameFor?: (service: Service) => string;
};

const controlStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  background: '#fff',
  color: '#111827',
};

export function ServiceMultiPicker({ selectedServices, onChange, nameFor }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const labelFor = nameFor ?? ((service) => service.name ?? service.id);
  const listQuery = useServiceList({ q: debouncedSearch, pageSize: PICKER_PAGE_SIZE });
  const services = listQuery.data?.items ?? [];
  const selectedIds = useMemo(() => selectedServices.map((service) => service.id), [selectedServices]);

  const browseServices = useMemo(
    () => services.filter((service) => !selectedIds.includes(service.id)),
    [services, selectedIds],
  );

  const totalDuration = servicesTotalDurationMinutes(selectedServices);
  const summaryLine = compactServiceSummary(selectedServices, labelFor, t);

  function addService(service: Service) {
    if (selectedIds.includes(service.id)) return;
    onChange([...selectedServices, service]);
  }

  function removeService(serviceId: string) {
    const next = selectedServices.filter((service) => service.id !== serviceId);
    onChange(next);
    if (next.length === 0) setSummaryExpanded(false);
  }

  function clearAll() {
    onChange([]);
    setSummaryExpanded(false);
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {selectedServices.length > 0 ? (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong>{t('bookings.servicePicker.visitSummary')}</strong>
                <span
                  style={{
                    minWidth: 22,
                    height: 22,
                    borderRadius: 999,
                    background: '#10b981',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 6px',
                  }}
                >
                  {selectedServices.length}
                </span>
              </div>
              {!summaryExpanded ? (
                <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 13 }}>{summaryLine}</p>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" onClick={clearAll} style={{ border: 'none', background: 'none', color: '#10b981', cursor: 'pointer', fontWeight: 600 }}>
                {t('common.clear')}
              </button>
              <button
                type="button"
                onClick={() => setSummaryExpanded((value) => !value)}
                style={{ ...controlStyle, width: 32, height: 32, padding: 0, cursor: 'pointer' }}
                aria-label={
                  summaryExpanded
                    ? t('bookings.servicePicker.collapse')
                    : t('bookings.servicePicker.expand')
                }
              >
                {summaryExpanded ? '▴' : '▾'}
              </button>
            </div>
          </div>

          {summaryExpanded ? (
            <div style={{ maxHeight: 168, overflowY: 'auto', marginTop: 10 }}>
              {selectedServices.map((service, index) => (
                <div
                  key={service.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      background: '#10b981',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {index + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {labelFor(service)}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>
                      {t('bookings.servicePicker.minutes', { minutes: serviceDurationMinutes(service) })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeService(service.id)}
                    style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer' }}
                    aria-label={t('bookings.servicePicker.removeAria', { name: labelFor(service) })}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid #e5e7eb', color: '#6b7280', fontSize: 13 }}>
            <span>{t('bookings.servicePicker.totalMinutes', { minutes: totalDuration })}</span>
          </div>
        </div>
      ) : (
        <div style={{ border: '1px dashed #d1d5db', borderRadius: 14, padding: 14, color: '#6b7280', fontSize: 14 }}>
          {t('bookings.servicePicker.chooseBelow')}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <span style={{ color: '#6b7280', fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>
          {selectedServices.length > 0
            ? t('bookings.servicePicker.addAnother')
            : t('bookings.servicePicker.chooseServices')}
        </span>
        {selectedServices.length > 0 ? (
          <span style={{ color: '#6b7280', fontSize: 12 }}>{t('bookings.servicePicker.available', { count: browseServices.length })}</span>
        ) : null}
      </div>

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={
          selectedServices.length > 0
            ? t('bookings.servicePicker.searchAvailable')
            : t('bookings.servicePicker.searchServices')
        }
        style={controlStyle}
      />

      <div style={{ maxHeight: 280, overflowY: 'auto', display: 'grid', gap: 8 }}>
        {listQuery.isFetching && browseServices.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>…</div>
        ) : browseServices.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>
            {search
              ? t('bookings.servicePicker.noMatch')
              : selectedServices.length > 0
                ? t('bookings.servicePicker.allAdded')
                : t('bookings.servicePicker.noneAvailable')}
          </div>
        ) : (
          browseServices.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => addService(service)}
              style={{
                ...controlStyle,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span>
                <strong>{labelFor(service)}</strong>
                <span style={{ display: 'block', color: '#6b7280', fontSize: 13, marginTop: 2 }}>
                  {t('bookings.servicePicker.minutes', { minutes: serviceDurationMinutes(service) })}
                </span>
              </span>
              <span style={{ color: '#10b981', fontWeight: 700 }}>+</span>
            </button>
          ))
        )}
      </div>

      {selectedServices.length > 1 ? (
        <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
          {t('bookings.servicePicker.runOrder', { minutes: totalDuration })}
        </p>
      ) : null}
    </div>
  );
}
