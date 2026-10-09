import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  AdminField,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from './AdminChrome';
import {
  usePlatformAddonPricingQuery,
  usePlatformSmartLookupHistoryQuery,
  usePlatformSmartLookupSettingsQuery,
  usePlatformAssistantSettingsQuery,
  useRefreshSmartLookupFxMutation,
  useUpdateAddonPricingMutation,
  useUpdateAssistantSettingsMutation,
  useUpdateSmartLookupSettingsMutation,
} from './adminHooks';
import { enrichLedgerSourceLabel } from '../shop/enrichMessages';

type UsageTab = 'addons' | 'assistant' | 'smart';
type CurrencyTab = 'INR' | 'USD';

function minorToMajor(minor?: number | null): string {
  if (minor == null) return '';
  return String(Math.round(minor) / 100);
}

function majorToMinor(major: string): number {
  const value = Number.parseFloat(major);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

function FlagToggle({
  on,
  title,
  hint,
  onClick,
}: {
  on: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`admin-toggle${on ? ' is-on' : ''}`} onClick={onClick}>
      <span>
        <strong>{title}</strong>
        <span className="admin-toggle__hint">{hint}</span>
      </span>
      <i className="admin-toggle__switch" aria-hidden />
    </button>
  );
}

function CurrencyTabs({
  value,
  onChange,
  inrHint,
  usdHint,
}: {
  value: CurrencyTab;
  onChange: (next: CurrencyTab) => void;
  inrHint: string;
  usdHint: string;
}) {
  return (
    <div className="admin-usage-currency">
      <div className="admin-editor-tabs" role="tablist" aria-label="SaaS currency">
        <button
          type="button"
          role="tab"
          aria-selected={value === 'INR'}
          className={`admin-editor-tab${value === 'INR' ? ' is-active' : ''}`}
          onClick={() => onChange('INR')}
        >
          India · INR
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === 'USD'}
          className={`admin-editor-tab${value === 'USD' ? ' is-active' : ''}`}
          onClick={() => onChange('USD')}
        >
          International · USD
        </button>
      </div>
      <p className="admin-usage-currency__hint">{value === 'INR' ? inrHint : usdHint}</p>
    </div>
  );
}

export function PlatformUsagePricingPage() {
  usePageMeta({ title: 'Usage pricing — Platform Admin' });
  const addonQuery = usePlatformAddonPricingQuery();
  const addonMutation = useUpdateAddonPricingMutation();
  const smartLookupQuery = usePlatformSmartLookupSettingsQuery();
  const smartLookupMutation = useUpdateSmartLookupSettingsMutation();
  const smartFxRefreshMutation = useRefreshSmartLookupFxMutation();
  const assistantSettingsQuery = usePlatformAssistantSettingsQuery();
  const assistantSettingsMutation = useUpdateAssistantSettingsMutation();

  const [tab, setTab] = useState<UsageTab>('addons');
  const [currencyTab, setCurrencyTab] = useState<CurrencyTab>('INR');
  const [message, setMessage] = useState<string | null>(null);

  const [addonStaffInr, setAddonStaffInr] = useState('');
  const [addonOfficeInr, setAddonOfficeInr] = useState('');
  const [addonPetsInr, setAddonPetsInr] = useState('');
  const [addonStaffUsd, setAddonStaffUsd] = useState('');
  const [addonOfficeUsd, setAddonOfficeUsd] = useState('');
  const [addonPetsUsd, setAddonPetsUsd] = useState('');
  const [addonReason, setAddonReason] = useState('Update add-on prices');

  const [assistantEnabled, setAssistantEnabled] = useState(true);
  const [assistantMsgPriceInr, setAssistantMsgPriceInr] = useState('0.50');
  const [assistantConfirmPriceInr, setAssistantConfirmPriceInr] = useState('1');
  const [assistantTopUpsInr, setAssistantTopUpsInr] = useState('50, 100, 250, 500');
  const [assistantMsgPriceUsd, setAssistantMsgPriceUsd] = useState('0.01');
  const [assistantConfirmPriceUsd, setAssistantConfirmPriceUsd] = useState('0.02');
  const [assistantTopUpsUsd, setAssistantTopUpsUsd] = useState('5, 10, 25, 50');
  const [assistantReason, setAssistantReason] = useState('Update Assistant wallet pricing');

  const [smartEnabled, setSmartEnabled] = useState(true);
  const [smartFx, setSmartFx] = useState('85');
  const [smartGstPercent, setSmartGstPercent] = useState('18');
  const [smartMarkupBps, setSmartMarkupBps] = useState('0');
  const [smartMinPaise, setSmartMinPaise] = useState('1');
  const [smartMinUsd, setSmartMinUsd] = useState('0.01');
  const [smartInputUsd, setSmartInputUsd] = useState('0.10');
  const [smartOutputUsd, setSmartOutputUsd] = useState('0.40');
  const [smartTopUpsInr, setSmartTopUpsInr] = useState('50, 100, 250, 500');
  const [smartTopUpsUsd, setSmartTopUpsUsd] = useState('5, 10, 25, 50');
  const [smartReason, setSmartReason] = useState('Update Smart lookup pricing');

  const [ledgerKind, setLedgerKind] = useState('money');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerQ, setLedgerQ] = useState('');
  const [ledgerSource, setLedgerSource] = useState('');
  const [ledgerDateFrom, setLedgerDateFrom] = useState('');
  const [ledgerDateTo, setLedgerDateTo] = useState('');
  const [ledgerWindow, setLedgerWindow] = useState<number | ''>(30);

  const smartHistoryQuery = usePlatformSmartLookupHistoryQuery({
    page: ledgerPage,
    page_size: 25,
    kind: ledgerKind,
    q: ledgerQ.trim() || undefined,
    source: ledgerSource || undefined,
    date_from: ledgerDateFrom || undefined,
    date_to: ledgerDateTo || undefined,
    window_days: ledgerDateFrom || ledgerDateTo ? '' : ledgerWindow,
  });

  useEffect(() => {
    const pricing = addonQuery.data;
    if (!pricing) return;
    setAddonStaffInr(minorToMajor(pricing.prices_minor?.INR?.staff ?? pricing.staff_price_paise));
    setAddonOfficeInr(minorToMajor(pricing.prices_minor?.INR?.office ?? pricing.office_price_paise));
    setAddonPetsInr(minorToMajor(pricing.prices_minor?.INR?.pets ?? pricing.pets_price_paise));
    setAddonStaffUsd(minorToMajor(pricing.prices_minor?.USD?.staff));
    setAddonOfficeUsd(minorToMajor(pricing.prices_minor?.USD?.office));
    setAddonPetsUsd(minorToMajor(pricing.prices_minor?.USD?.pets));
  }, [addonQuery.data]);

  useEffect(() => {
    const settings = smartLookupQuery.data;
    if (!settings) return;
    setSmartEnabled(Boolean(settings.enabled));
    setSmartFx(String(settings.usd_to_inr));
    setSmartGstPercent(String(settings.gst_percent ?? 18));
    setSmartMarkupBps(String(Number(((settings.markup_bps ?? 0) / 100).toFixed(2))));
    setSmartMinPaise(
      String(
        Number(
          ((settings.prices_minor?.INR?.min_charge ?? settings.min_charge_paise ?? 0) / 100).toFixed(2),
        ),
      ),
    );
    setSmartMinUsd(String(Number((((settings.prices_minor?.USD?.min_charge ?? 1) / 100)).toFixed(2))));
    setSmartInputUsd(String(settings.input_usd_per_million));
    setSmartOutputUsd(String(settings.output_usd_per_million));
    setSmartTopUpsInr(
      (settings.prices_minor?.INR?.top_ups ?? settings.suggested_top_up_paise ?? [])
        .map((paise) => String(paise / 100))
        .join(', '),
    );
    setSmartTopUpsUsd(
      (settings.prices_minor?.USD?.top_ups ?? [500, 1000, 2500, 5000])
        .map((cents) => String(cents / 100))
        .join(', '),
    );
  }, [smartLookupQuery.data]);

  useEffect(() => {
    const settings = assistantSettingsQuery.data;
    if (!settings) return;
    setAssistantEnabled(Boolean(settings.enabled));
    setAssistantMsgPriceInr(
      String(
        Number(
          ((settings.prices_minor?.INR?.message ?? settings.message_price_paise) / 100).toFixed(2),
        ),
      ),
    );
    setAssistantConfirmPriceInr(
      String(
        Number(
          ((settings.prices_minor?.INR?.confirm ?? settings.confirm_price_paise) / 100).toFixed(2),
        ),
      ),
    );
    setAssistantTopUpsInr(
      (settings.prices_minor?.INR?.top_ups ?? settings.suggested_top_up_paise ?? [])
        .map((paise) => String(paise / 100))
        .join(', '),
    );
    setAssistantMsgPriceUsd(
      String(Number((((settings.prices_minor?.USD?.message ?? 1) / 100)).toFixed(2))),
    );
    setAssistantConfirmPriceUsd(
      String(Number((((settings.prices_minor?.USD?.confirm ?? 2) / 100)).toFixed(2))),
    );
    setAssistantTopUpsUsd(
      (settings.prices_minor?.USD?.top_ups ?? [500, 1000, 2500, 5000])
        .map((cents) => String(cents / 100))
        .join(', '),
    );
  }, [assistantSettingsQuery.data]);

  function parseMajorListToMinor(raw: string, minMinor: number) {
    return raw
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => Math.round(Number(part) * 100))
      .filter((minor) => Number.isFinite(minor) && minor >= minMinor);
  }

  function saveAddonPrices() {
    setMessage(null);
    const staffInr = majorToMinor(addonStaffInr);
    const officeInr = majorToMinor(addonOfficeInr);
    const petsInr = majorToMinor(addonPetsInr);
    addonMutation.mutate(
      {
        staff_price_paise: staffInr,
        office_price_paise: officeInr,
        pets_price_paise: petsInr,
        prices_minor: {
          INR: { staff: staffInr, office: officeInr, pets: petsInr },
          USD: {
            staff: majorToMinor(addonStaffUsd),
            office: majorToMinor(addonOfficeUsd),
            pets: majorToMinor(addonPetsUsd),
          },
        },
        reason: addonReason,
      },
      {
        onSuccess: () => setMessage('Add-on prices saved.'),
        onError: (err) =>
          setMessage(err instanceof Error ? err.message : "Couldn't save add-on prices. Try again."),
      },
    );
  }

  function saveAssistantSettings() {
    setMessage(null);
    const tops = parseMajorListToMinor(assistantTopUpsInr, 100);
    const topsUsd = parseMajorListToMinor(assistantTopUpsUsd, 1);
    const msgPaise = Math.max(1, Math.round(Number(assistantMsgPriceInr) * 100) || 50);
    const confirmPaise = Math.max(1, Math.round(Number(assistantConfirmPriceInr) * 100) || 100);
    const msgUsd = Math.max(1, Math.round(Number(assistantMsgPriceUsd) * 100) || 1);
    const confirmUsd = Math.max(1, Math.round(Number(assistantConfirmPriceUsd) * 100) || 2);
    assistantSettingsMutation.mutate(
      {
        enabled: assistantEnabled,
        message_price_paise: msgPaise,
        confirm_price_paise: confirmPaise,
        suggested_top_up_paise: tops,
        prices_minor: {
          INR: { message: msgPaise, confirm: confirmPaise, top_ups: tops },
          USD: { message: msgUsd, confirm: confirmUsd, top_ups: topsUsd },
        },
        reason: assistantReason,
      },
      {
        onSuccess: () => setMessage('Assistant wallet settings saved.'),
        onError: (err) =>
          setMessage(err instanceof Error ? err.message : "Couldn't save Assistant settings. Try again."),
      },
    );
  }

  function saveSmartLookupSettings() {
    setMessage(null);
    const tops = parseMajorListToMinor(smartTopUpsInr, 100);
    const topsUsd = parseMajorListToMinor(smartTopUpsUsd, 1);
    const markupPercent = Number(smartMarkupBps);
    const markupBps = Number.isFinite(markupPercent) ? Math.round(markupPercent * 100) : 0;
    const minRupees = Number(smartMinPaise);
    const minPaise = Number.isFinite(minRupees) ? Math.max(0, Math.round(minRupees * 100)) : 0;
    const minUsdMajor = Number(smartMinUsd);
    const minUsd = Number.isFinite(minUsdMajor) ? Math.max(0, Math.round(minUsdMajor * 100)) : 1;
    smartLookupMutation.mutate(
      {
        enabled: smartEnabled,
        usd_to_inr: smartFx,
        gst_percent: smartGstPercent,
        markup_bps: markupBps,
        min_charge_paise: minPaise,
        input_usd_per_million: smartInputUsd,
        output_usd_per_million: smartOutputUsd,
        suggested_top_up_paise: tops,
        prices_minor: {
          INR: { min_charge: minPaise, top_ups: tops },
          USD: { min_charge: minUsd, top_ups: topsUsd },
        },
        reason: smartReason,
      },
      {
        onSuccess: () => setMessage('Orbit Mart Smart lookup settings saved.'),
        onError: (err) =>
          setMessage(err instanceof Error ? err.message : "Couldn't save Smart lookup settings. Try again."),
      },
    );
  }

  function renderAddons() {
    const isInr = currencyTab === 'INR';
    return (
      <AdminSection
        title="Seat & pack add-ons"
        description="Monthly unit prices charged with the subscription. Yearly billing multiplies by each plan’s months-charged setting."
      >
        <CurrencyTabs
          value={currencyTab}
          onChange={setCurrencyTab}
          inrHint="Shown to India workspaces (Razorpay / Cashfree / UPI)."
          usdHint="Shown to international workspaces (Stripe)."
        />
        <div className="admin-usage-price-grid">
          <AdminField label={isInr ? 'Extra staff (₹ / month)' : 'Extra staff ($ / month)'}>
            <input
              type="number"
              min={0}
              step={isInr ? '1' : '0.01'}
              value={isInr ? addonStaffInr : addonStaffUsd}
              onChange={(e) =>
                isInr ? setAddonStaffInr(e.target.value) : setAddonStaffUsd(e.target.value)
              }
            />
          </AdminField>
          <AdminField label={isInr ? 'Extra office (₹ / month)' : 'Extra office ($ / month)'}>
            <input
              type="number"
              min={0}
              step={isInr ? '1' : '0.01'}
              value={isInr ? addonOfficeInr : addonOfficeUsd}
              onChange={(e) =>
                isInr ? setAddonOfficeInr(e.target.value) : setAddonOfficeUsd(e.target.value)
              }
            />
          </AdminField>
          <AdminField label={isInr ? 'Pets pack (₹ / month)' : 'Pets pack ($ / month)'}>
            <input
              type="number"
              min={0}
              step={isInr ? '1' : '0.01'}
              value={isInr ? addonPetsInr : addonPetsUsd}
              onChange={(e) =>
                isInr ? setAddonPetsInr(e.target.value) : setAddonPetsUsd(e.target.value)
              }
            />
          </AdminField>
        </div>
        <div className="admin-reason-bar">
          <AdminField label="Reason (audit log)">
            <input value={addonReason} onChange={(e) => setAddonReason(e.target.value)} />
          </AdminField>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={addonMutation.isPending || addonQuery.isLoading}
            onClick={saveAddonPrices}
          >
            {addonMutation.isPending ? 'Saving…' : 'Save add-on prices'}
          </button>
        </div>
        <p className="admin-usage-footnote">
          Both currencies are saved together. Switch the tab to edit the other market without losing
          unsaved values.
        </p>
      </AdminSection>
    );
  }

  function renderAssistant() {
    const isInr = currencyTab === 'INR';
    return (
      <AdminSection
        title="Chat Assistant wallet"
        description="After free daily limits, businesses top up a prepaid wallet. Debits use the workspace SaaS currency."
      >
        <div style={{ marginBottom: 14 }}>
          <FlagToggle
            on={assistantEnabled}
            title={assistantEnabled ? 'Prepaid overage on' : 'Prepaid overage off'}
            hint={
              assistantEnabled
                ? 'Wallet top-ups and auto-debit after free limits are allowed.'
                : 'Free daily limits still apply; prepaid overage is blocked.'
            }
            onClick={() => setAssistantEnabled((current) => !current)}
          />
        </div>
        <CurrencyTabs
          value={currencyTab}
          onChange={setCurrencyTab}
          inrHint="India wallet amounts (paise stored as ₹)."
          usdHint="International wallet amounts (cents stored as $)."
        />
        <div className="admin-usage-price-grid">
          <AdminField label={isInr ? 'Message price (₹)' : 'Message price ($)'}>
            <input
              type="number"
              min={0.01}
              step="0.01"
              value={isInr ? assistantMsgPriceInr : assistantMsgPriceUsd}
              onChange={(e) =>
                isInr
                  ? setAssistantMsgPriceInr(e.target.value)
                  : setAssistantMsgPriceUsd(e.target.value)
              }
            />
          </AdminField>
          <AdminField label={isInr ? 'Confirm price (₹)' : 'Confirm price ($)'}>
            <input
              type="number"
              min={0.01}
              step="0.01"
              value={isInr ? assistantConfirmPriceInr : assistantConfirmPriceUsd}
              onChange={(e) =>
                isInr
                  ? setAssistantConfirmPriceInr(e.target.value)
                  : setAssistantConfirmPriceUsd(e.target.value)
              }
            />
          </AdminField>
          <AdminField
            label={isInr ? 'Suggested top-ups (₹)' : 'Suggested top-ups ($)'}
            hint="Comma-separated major units"
          >
            <input
              value={isInr ? assistantTopUpsInr : assistantTopUpsUsd}
              onChange={(e) =>
                isInr ? setAssistantTopUpsInr(e.target.value) : setAssistantTopUpsUsd(e.target.value)
              }
              placeholder={isInr ? '50, 100, 250, 500' : '5, 10, 25, 50'}
            />
          </AdminField>
        </div>
        <div className="admin-smart-lookup__chips" style={{ marginBottom: 12 }}>
          {(isInr ? assistantTopUpsInr : assistantTopUpsUsd)
            .split(/[,\s]+/)
            .map((part) => part.trim())
            .filter(Boolean)
            .map((amount) => (
              <span key={`${isInr ? 'inr' : 'usd'}-${amount}`} className="admin-smart-lookup__chip">
                {isInr ? `₹${amount}` : `$${amount}`}
              </span>
            ))}
        </div>
        <div className="admin-reason-bar">
          <AdminField label="Reason">
            <input value={assistantReason} onChange={(e) => setAssistantReason(e.target.value)} />
          </AdminField>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={assistantSettingsMutation.isPending || assistantSettingsQuery.isLoading}
            onClick={saveAssistantSettings}
          >
            {assistantSettingsMutation.isPending ? 'Saving…' : 'Save Assistant wallet'}
          </button>
        </div>
      </AdminSection>
    );
  }

  function renderSmartLookup() {
    const settings = smartLookupQuery.data;
    const fetchedAt = settings?.usd_to_inr_fetched_at
      ? new Date(settings.usd_to_inr_fetched_at).toLocaleString()
      : null;
    const fx = Number(smartFx) || 0;
    const gst = Number(smartGstPercent) || 0;
    const markupPct = Number(smartMarkupBps) || 0;
    const exampleUsd = 0.001;
    const exampleInr = exampleUsd * fx * (1 + markupPct / 100) * (1 + gst / 100);
    const examplePaise = Math.max(1, Math.round(exampleInr * 100));
    const exampleUsdCents = Math.max(1, Math.round(exampleUsd * (1 + markupPct / 100) * 100));
    const busy =
      smartLookupMutation.isPending || smartFxRefreshMutation.isPending || smartLookupQuery.isLoading;
    const isInr = currencyTab === 'INR';

    return (
      <div className="admin-smart-lookup">
        <div className="admin-smart-lookup__hero">
          <div>
            <p className="admin-smart-lookup__kicker">Orbit Mart add-on</p>
            <h3 className="admin-smart-lookup__title">Smart product lookup</h3>
            <p className="admin-smart-lookup__lead">
              Pack-photo AI fill when barcodes miss the free catalog. Enable{' '}
              <strong>Smart product lookup</strong> on each Orbit Mart package&apos;s Features tab,
              then control pass-through pricing here. Shops opt in and top up a prepaid wallet.
            </p>
          </div>
          <AdminStatus status={smartEnabled ? 'active' : 'inactive'} />
        </div>

        <div className="admin-smart-lookup__kpis">
          <div className="admin-smart-lookup__kpi">
            <span>USD → INR</span>
            <strong>{fx ? fx.toFixed(2) : '—'}</strong>
            <em>
              {settings?.usd_to_inr_source || 'manual'}
              {fetchedAt ? ` · ${fetchedAt}` : ''}
            </em>
          </div>
          <div className="admin-smart-lookup__kpi">
            <span>GST (India)</span>
            <strong>{gst.toFixed(gst % 1 ? 2 : 0)}%</strong>
            <em>Applied after FX</em>
          </div>
          <div className="admin-smart-lookup__kpi">
            <span>Model</span>
            <strong>{settings?.model ?? 'gemini-2.5-flash-lite'}</strong>
            <em>Flash-Lite list prices</em>
          </div>
          <div className="admin-smart-lookup__kpi admin-smart-lookup__kpi--preview">
            <span>Sample debit</span>
            <strong>
              {isInr ? `₹${(examplePaise / 100).toFixed(2)}` : `$${(exampleUsdCents / 100).toFixed(2)}`}
            </strong>
            <em>{isInr ? '$0.001 × FX × markup × GST' : '$0.001 × markup (USD wallet)'}</em>
          </div>
        </div>

        <section className="admin-smart-lookup__card">
          <header>
            <h4>Availability</h4>
            <p>
              Master switch for all Orbit Mart businesses. Per-tenant override uses feature flag{' '}
              <code>shopie_smart_lookup</code>.
            </p>
          </header>
          <FlagToggle
            on={smartEnabled}
            title={smartEnabled ? 'Smart lookup is on' : 'Smart lookup is off'}
            hint={
              smartEnabled
                ? 'Businesses can enable pack-photo fill and debit wallets.'
                : 'Pack-photo AI is blocked platform-wide.'
            }
            onClick={() => setSmartEnabled((current) => !current)}
          />
        </section>

        <div className="admin-smart-lookup__grid">
          <section className="admin-smart-lookup__card">
            <header>
              <div className="admin-smart-lookup__card-head">
                <div>
                  <h4>India cost engine</h4>
                  <p>FX + GST convert Gemini USD token cost into INR wallet debits.</p>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  disabled={busy}
                  onClick={() => {
                    setMessage(null);
                    smartFxRefreshMutation.mutate(
                      { reason: 'manual FX refresh from usage pricing UI' },
                      {
                        onSuccess: (data) => {
                          setSmartFx(String(data.usd_to_inr));
                          setMessage(
                            `USD→INR refreshed to ${data.usd_to_inr} (${data.usd_to_inr_source || 'frankfurter'}).`,
                          );
                        },
                        onError: (err) =>
                          setMessage(
                            err instanceof Error ? err.message : 'Failed to refresh USD→INR.',
                          ),
                      },
                    );
                  }}
                >
                  {smartFxRefreshMutation.isPending ? 'Refreshing…' : 'Refresh rate'}
                </button>
              </div>
            </header>
            <div className="admin-smart-lookup__fields">
              <AdminField label="USD → INR" hint="1 USD × this rate = INR before GST">
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={smartFx}
                  onChange={(e) => setSmartFx(e.target.value)}
                />
              </AdminField>
              <AdminField label="GST %" hint="Typical Cloud Billing GST is 18%">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={smartGstPercent}
                  onChange={(e) => setSmartGstPercent(e.target.value)}
                />
              </AdminField>
              <AdminField label="Markup %" hint="0 = pass-through AI cost">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={smartMarkupBps}
                  onChange={(e) => setSmartMarkupBps(e.target.value)}
                />
              </AdminField>
            </div>
          </section>

          <section className="admin-smart-lookup__card">
            <header>
              <h4>Gemini list prices</h4>
              <p>USD per 1 million tokens. Keep aligned with Google’s published Flash-Lite rates.</p>
            </header>
            <div className="admin-smart-lookup__fields">
              <AdminField label="Input USD / 1M">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={smartInputUsd}
                  onChange={(e) => setSmartInputUsd(e.target.value)}
                />
              </AdminField>
              <AdminField label="Output USD / 1M">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={smartOutputUsd}
                  onChange={(e) => setSmartOutputUsd(e.target.value)}
                />
              </AdminField>
            </div>
          </section>
        </div>

        <section className="admin-smart-lookup__card admin-smart-lookup__card--wide">
          <header>
            <h4>Wallet floors & top-ups</h4>
            <p>Per-currency minimum debit and suggested top-up chips in Products & billing.</p>
          </header>
          <CurrencyTabs
            value={currencyTab}
            onChange={setCurrencyTab}
            inrHint="India wallets settle in ₹ (UPI). Floor applies after FX × markup × GST."
            usdHint="International wallets settle in $. Floor applies to USD token cost × markup (no India GST)."
          />
          <div className="admin-usage-price-grid">
            <AdminField label={isInr ? 'Minimum charge (₹)' : 'Minimum charge ($)'}>
              <input
                type="number"
                min={0}
                step="0.01"
                value={isInr ? smartMinPaise : smartMinUsd}
                onChange={(e) =>
                  isInr ? setSmartMinPaise(e.target.value) : setSmartMinUsd(e.target.value)
                }
              />
            </AdminField>
            <AdminField label={isInr ? 'Suggested top-ups (₹)' : 'Suggested top-ups ($)'}>
              <input
                value={isInr ? smartTopUpsInr : smartTopUpsUsd}
                onChange={(e) =>
                  isInr ? setSmartTopUpsInr(e.target.value) : setSmartTopUpsUsd(e.target.value)
                }
                placeholder={isInr ? '50, 100, 250, 500' : '5, 10, 25, 50'}
              />
            </AdminField>
          </div>
          <div className="admin-smart-lookup__chips">
            {(isInr ? smartTopUpsInr : smartTopUpsUsd)
              .split(/[,\s]+/)
              .map((part) => part.trim())
              .filter(Boolean)
              .map((amount) => (
                <span key={`${isInr ? 'inr' : 'usd'}-${amount}`} className="admin-smart-lookup__chip">
                  {isInr ? `₹${amount}` : `$${amount}`}
                </span>
              ))}
          </div>
        </section>

        <div className="admin-reason-bar">
          <AdminField label="Audit reason">
            <input value={smartReason} onChange={(e) => setSmartReason(e.target.value)} />
          </AdminField>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={busy}
            onClick={saveSmartLookupSettings}
          >
            {smartLookupMutation.isPending ? 'Saving…' : 'Save Smart lookup'}
          </button>
        </div>

        <section className="admin-smart-lookup__card admin-smart-lookup__card--wide">
          <h4>Wallet ledger</h4>
          <p>All tenant credits and Smart fill debits. Filter by workspace, source, and date.</p>
          <div className="admin-filter-row" style={{ marginTop: 12 }}>
            <AdminField label="Search">
              <input
                value={ledgerQ}
                onChange={(event) => {
                  setLedgerPage(1);
                  setLedgerQ(event.target.value);
                }}
                placeholder="Workspace, business, barcode…"
              />
            </AdminField>
            <AdminField label="Source">
              <select
                value={ledgerSource}
                onChange={(event) => {
                  setLedgerPage(1);
                  setLedgerSource(event.target.value);
                }}
              >
                <option value="">All sources</option>
                {(smartHistoryQuery.data?.sources ?? ['wallet_top_up', 'gemini_vision']).map(
                  (source) => (
                    <option key={source} value={source}>
                      {enrichLedgerSourceLabel(source)}
                    </option>
                  ),
                )}
              </select>
            </AdminField>
            <AdminField label="From">
              <input
                type="date"
                value={ledgerDateFrom}
                onChange={(event) => {
                  setLedgerPage(1);
                  setLedgerDateFrom(event.target.value);
                }}
              />
            </AdminField>
            <AdminField label="To">
              <input
                type="date"
                value={ledgerDateTo}
                onChange={(event) => {
                  setLedgerPage(1);
                  setLedgerDateTo(event.target.value);
                }}
              />
            </AdminField>
          </div>
          <div className="admin-chip-row" style={{ margin: '12px 0' }}>
            {(
              [
                ['money', 'Money'],
                ['credits', 'Credits'],
                ['debits', 'Debits'],
                ['all', 'All'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`admin-chip${ledgerKind === value ? ' is-active' : ''}`}
                onClick={() => {
                  setLedgerPage(1);
                  setLedgerKind(value);
                }}
              >
                {label}
              </button>
            ))}
            {(
              [
                [7, '7d'],
                [30, '30d'],
                [90, '90d'],
                ['', 'All time'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={String(value)}
                type="button"
                className={`admin-chip${ledgerWindow === value && !ledgerDateFrom && !ledgerDateTo ? ' is-active' : ''}`}
                onClick={() => {
                  setLedgerPage(1);
                  setLedgerDateFrom('');
                  setLedgerDateTo('');
                  setLedgerWindow(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {smartHistoryQuery.data?.summary ? (
            <div className="admin-smart-lookup__kpis" style={{ marginBottom: 12 }}>
              <div className="admin-smart-lookup__kpi">
                <span>Credits</span>
                <strong>₹{smartHistoryQuery.data.summary.credits_inr.toFixed(2)}</strong>
                <em>{smartHistoryQuery.data.summary.credit_count} entries</em>
              </div>
              <div className="admin-smart-lookup__kpi">
                <span>Debits</span>
                <strong>₹{smartHistoryQuery.data.summary.debits_inr.toFixed(2)}</strong>
                <em>{smartHistoryQuery.data.summary.debit_count} entries</em>
              </div>
              <div className="admin-smart-lookup__kpi">
                <span>Net</span>
                <strong>₹{smartHistoryQuery.data.summary.net_inr.toFixed(2)}</strong>
                <em>{smartHistoryQuery.data.total} matching</em>
              </div>
            </div>
          ) : null}
          {smartHistoryQuery.isLoading ? (
            <p>Loading ledger…</p>
          ) : smartHistoryQuery.data?.items?.length ? (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Workspace</th>
                      <th>Business</th>
                      <th>Entry</th>
                      <th>Amount</th>
                      <th>Balance after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {smartHistoryQuery.data.items.map((row) => {
                      const paise = row.charged_paise ?? 0;
                      const amount =
                        paise > 0
                          ? `−₹${(paise / 100).toFixed(2)}`
                          : paise < 0
                            ? `+₹${(Math.abs(paise) / 100).toFixed(2)}`
                            : 'Free';
                      const entry =
                        row.source === 'wallet_top_up'
                          ? 'Top-up'
                          : row.code
                            ? `Smart fill · ${row.code}`
                            : enrichLedgerSourceLabel(row.source);
                      return (
                        <tr key={row.id}>
                          <td>{new Date(row.created_at).toLocaleString()}</td>
                          <td>{row.tenant_name || row.tenant_slug || '—'}</td>
                          <td>{row.business_name || '—'}</td>
                          <td>{entry}</td>
                          <td>{amount}</td>
                          <td>
                            {row.balance_after_paise == null
                              ? '—'
                              : `₹${(Number(row.balance_after_paise) / 100).toFixed(2)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 12,
                }}
              >
                <span>
                  Page {smartHistoryQuery.data.page} of {smartHistoryQuery.data.total_pages ?? 1} ·{' '}
                  {smartHistoryQuery.data.total} entries
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost"
                    disabled={ledgerPage <= 1 || smartHistoryQuery.isFetching}
                    onClick={() => setLedgerPage((page) => Math.max(1, page - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost"
                    disabled={!smartHistoryQuery.data.has_more || smartHistoryQuery.isFetching}
                    onClick={() => setLedgerPage((page) => page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p>No matching wallet movements.</p>
          )}
        </section>
      </div>
    );
  }

  return (
    <AdminPage>
      <AdminPageHeader
        title="Usage pricing"
        description="Seat add-ons, Chat Assistant wallet, and Orbit Mart Smart product lookup — priced separately for India (INR) and international (USD)."
        actions={
          <Link className="admin-btn admin-btn--ghost" to="/admin/packages">
            Plan packages
          </Link>
        }
      />
      {message ? (
        <p className={`admin-message ${message.includes('saved') || message.includes('refreshed') ? 'admin-message--ok' : ''}`}>
          {message}
        </p>
      ) : null}

      <div className="admin-editor-tabs" role="tablist" aria-label="Usage pricing sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'addons'}
          className={`admin-editor-tab${tab === 'addons' ? ' is-active' : ''}`}
          onClick={() => setTab('addons')}
        >
          Add-ons
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'assistant'}
          className={`admin-editor-tab${tab === 'assistant' ? ' is-active' : ''}`}
          onClick={() => setTab('assistant')}
        >
          Assistant
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'smart'}
          className={`admin-editor-tab${tab === 'smart' ? ' is-active' : ''}`}
          onClick={() => setTab('smart')}
        >
          Smart lookup
        </button>
      </div>

      {tab === 'addons' ? renderAddons() : null}
      {tab === 'assistant' ? renderAssistant() : null}
      {tab === 'smart' ? renderSmartLookup() : null}
    </AdminPage>
  );
}
