import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Banknote,
  Building2,
  FileSpreadsheet,
  Landmark,
  Plus,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Truck,
  UsersRound,
  Wallet,
  Warehouse,
} from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatMoney } from '../../lib/currency';
import { useShopBooksDashboard } from './shopHooks';
import { useRoleMenus } from '../../hooks/useRoleMenus';

function KpiTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  accent: string;
}) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 108, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            display: 'grid',
            placeItems: 'center',
            background: accent,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          <Icon size={16} strokeWidth={2.25} />
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>{value}</p>
    </Card>
  );
}

function QuickLink({
  to,
  label,
  description,
  icon: Icon,
}: {
  to: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}) {
  return (
    <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 12,
          border: '1px solid var(--border, #e5e7eb)',
          background: 'var(--card, #fff)',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
        }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--muted, #f3f4f6)',
            color: 'var(--foreground)',
            flexShrink: 0,
          }}
        >
          <Icon size={17} strokeWidth={2} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>{description}</div>
        </div>
      </div>
    </Link>
  );
}

export function ShopBooksDashboardPage() {
  const { t } = useTranslation();
  const tb = (key: string) => String(t(`shop.booksDashboard.${key}`));
  const workspace = useWorkspace();
  const dashboard = useShopBooksDashboard();
  const { isEnabled, isPathEnabled } = useRoleMenus();
  const currency = workspace.activeBusiness?.currency;

  const cash = Number(dashboard.data?.cash ?? 0);
  const bank = Number(dashboard.data?.bank ?? 0);
  const toCollect = Number(dashboard.data?.to_collect ?? 0);
  const toPay = Number(dashboard.data?.to_pay ?? 0);

  return (
    <div className="page-stack">
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0 }}>{tb('title')}</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
              {tb('subtitle')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isPathEnabled('/shop/books/sale') ? (
            <Link to="/shop/books/sale/new">
              <Button type="button" variant="primary">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  {tb('sale')}
                </span>
              </Button>
            </Link>
            ) : null}
            {isPathEnabled('/shop/books/purchase') ? (
            <Link to="/shop/books/purchase/new">
              <Button type="button" variant="neutral">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  {tb('purchase')}
                </span>
              </Button>
            </Link>
            ) : null}
            {isPathEnabled('/shop/books/expense') ? (
            <Link to="/shop/books/expense?new=1">
              <Button type="button" variant="neutral">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  {tb('expense')}
                </span>
              </Button>
            </Link>
            ) : null}
            {isPathEnabled('/shop/books/parties') ? (
            <Link to="/shop/books/parties?new=supplier">
              <Button type="button" variant="neutral">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  {tb('party')}
                </span>
              </Button>
            </Link>
            ) : null}
          </div>
        </div>
      </Card>

      {dashboard.error ? <p role="alert">{(dashboard.error as Error).message}</p> : null}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        {isEnabled('booksCash') ? <KpiTile label={tb('cashInHand')} value={formatMoney(cash, currency)} icon={Wallet} accent="#16a34a" /> : null}
        {isEnabled('booksCash') ? <KpiTile label={tb('bankBalance')} value={formatMoney(bank, currency)} icon={Landmark} accent="#2563eb" /> : null}
        {isEnabled('booksParties') ? <KpiTile label={tb('toCollect')} value={formatMoney(toCollect, currency)} icon={Banknote} accent="#d97706" /> : null}
        {isEnabled('booksParties') ? <KpiTile label={tb('toPay')} value={formatMoney(toPay, currency)} icon={Building2} accent="#dc2626" /> : null}
      </div>

      <Card>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>{tb('quickLinks')}</h3>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          {isPathEnabled('/shop/books/sale') ? <QuickLink to="/shop/books/sale" label={tb('links.sales')} description={tb('links.salesDesc')} icon={ShoppingCart} /> : null}
          {isPathEnabled('/shop/books/purchase') ? <QuickLink to="/shop/books/purchase" label={tb('links.purchases')} description={tb('links.purchasesDesc')} icon={ShoppingBag} /> : null}
          {isPathEnabled('/shop/books/expense') ? <QuickLink to="/shop/books/expense" label={tb('links.expenses')} description={tb('links.expensesDesc')} icon={FileSpreadsheet} /> : null}
          {isPathEnabled('/shop/books/cash') ? <QuickLink to="/shop/books/cash" label={tb('links.cashBank')} description={tb('links.cashBankDesc')} icon={Landmark} /> : null}
          {isPathEnabled('/shop/books/parties') ? <QuickLink to="/shop/books/parties" label={tb('links.parties')} description={tb('links.partiesDesc')} icon={UsersRound} /> : null}
          {isPathEnabled('/shop/billing') ? <QuickLink to="/shop/billing" label={tb('links.estimates')} description={tb('links.estimatesDesc')} icon={FileSpreadsheet} /> : null}
          {isPathEnabled('/shop/books/sale-orders') ? <QuickLink to="/shop/books/sale-orders" label={tb('links.saleOrders')} description={tb('links.estimatesDesc')} icon={FileSpreadsheet} /> : null}
          {isPathEnabled('/shop/books/purchase-orders') ? <QuickLink to="/shop/books/purchase-orders" label={tb('links.purchaseOrders')} description={tb('links.purchaseOrdersDesc')} icon={FileSpreadsheet} /> : null}
          {isPathEnabled('/shop/books/delivery-challans') ? <QuickLink to="/shop/books/delivery-challans" label={tb('links.challans')} description={tb('links.challansDesc')} icon={Truck} /> : null}
          {isPathEnabled('/shop/godowns') ? <QuickLink to="/shop/godowns" label={tb('links.godowns')} description={tb('links.godownsDesc')} icon={Warehouse} /> : null}
          {isPathEnabled('/shop/books/reports') ? <QuickLink to="/shop/books/reports" label={tb('links.reports')} description={tb('links.reportsDesc')} icon={FileSpreadsheet} /> : null}
          {isPathEnabled('/shop/books/compliance') ? (
          <QuickLink
            to="/shop/books/compliance"
            label={tb('links.compliance')}
            description={tb('links.complianceDesc')}
            icon={ShieldCheck}
          />
          ) : null}
        </div>
      </Card>

      {isEnabled('booksCash') && dashboard.data?.accounts?.length ? (
        <Card>
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>{tb('accounts')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {dashboard.data.accounts.map((account) => (
              <div key={account.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>
                  {account.name} <span style={{ color: 'var(--muted-foreground)' }}>· {account.account_type}</span>
                </span>
                <strong>{formatMoney(Number(account.current_balance ?? 0), currency)}</strong>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
