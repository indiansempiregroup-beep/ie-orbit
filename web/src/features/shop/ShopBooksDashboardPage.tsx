import React from 'react';
import { Link } from 'react-router-dom';
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
  const workspace = useWorkspace();
  const dashboard = useShopBooksDashboard();
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
            <h2 style={{ margin: 0 }}>ShopIE Books</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
              Cash, GST sales/purchases, party ledgers, and compliance reports for your shop.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/shop/books/sale/new">
              <Button type="button" variant="primary">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  Sale
                </span>
              </Button>
            </Link>
            <Link to="/shop/books/purchase/new">
              <Button type="button" variant="neutral">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  Purchase
                </span>
              </Button>
            </Link>
            <Link to="/shop/books/expense?new=1">
              <Button type="button" variant="neutral">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  Expense
                </span>
              </Button>
            </Link>
            <Link to="/shop/books/parties?new=supplier">
              <Button type="button" variant="neutral">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  Party
                </span>
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {dashboard.error ? <p role="alert">{(dashboard.error as Error).message}</p> : null}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <KpiTile label="Cash in hand" value={formatMoney(cash, currency)} icon={Wallet} accent="#16a34a" />
        <KpiTile label="Bank balance" value={formatMoney(bank, currency)} icon={Landmark} accent="#2563eb" />
        <KpiTile label="To collect" value={formatMoney(toCollect, currency)} icon={Banknote} accent="#d97706" />
        <KpiTile label="To pay" value={formatMoney(toPay, currency)} icon={Building2} accent="#dc2626" />
      </div>

      <Card>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>Quick links</h3>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          <QuickLink to="/shop/books/sale" label="Sales" description="GST invoices to customers" icon={ShoppingCart} />
          <QuickLink to="/shop/books/purchase" label="Purchases" description="Bills from suppliers" icon={ShoppingBag} />
          <QuickLink to="/shop/books/expense" label="Expenses" description="Shop running costs" icon={FileSpreadsheet} />
          <QuickLink to="/shop/books/cash" label="Cash & bank" description="Accounts, payments, transfers" icon={Landmark} />
          <QuickLink to="/shop/books/parties" label="Parties" description="Customers & suppliers ledger" icon={UsersRound} />
          <QuickLink to="/shop/books/delivery-challans" label="Delivery challans" description="Create, track, and dispatch goods" icon={Truck} />
          <QuickLink to="/shop/godowns" label="Godowns" description="Warehouses, stock locations, transfers" icon={Warehouse} />
          <QuickLink to="/shop/books/reports" label="Reports" description="Daybook, GSTR-1/3B, P&L" icon={FileSpreadsheet} />
          <QuickLink
            to="/shop/books/compliance"
            label="GST compliance"
            description="E-invoice (IRN) & e-way bill settings"
            icon={ShieldCheck}
          />
        </div>
      </Card>

      {dashboard.data?.accounts?.length ? (
        <Card>
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>Accounts</h3>
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
