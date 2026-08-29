import { Bell, Search, Shield } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBusinessOptions } from '../features/dashboard/dashboardHooks';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useAuth } from '../hooks/useAuth';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import { getSubscribedProducts } from '../config/products';
import { useAppShellTitle } from '../hooks/useAppShellTitle';
import { buildWorkspaceSnapshot, formatWorkspaceLabel } from '../lib/workspaceModel';
import { canManageBusinessSettings, hasPermission, isPlatformAdminOnly } from '../utils/roles';

export function AppShellHeader() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const { user } = useAuth();
  const businessOptions = useBusinessOptions();
  const canSearchStaff = hasPermission(user, 'staff:read') || hasPermission(user, 'staff:write') || hasPermission(user, 'staff:manage');
  const canManageWorkspace = canManageBusinessSettings(user);
  const showPlatformAdminLink = isPlatformAdminOnly(user);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchResults = useGlobalSearch(debouncedSearch);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const searchItems = useMemo(() => {
    const data = searchResults.data;
    if (!data) return [];
    return [
      ...data.customers.map((item) => ({
        id: `customer-${item.id}`,
        label: item.full_name ?? item.email ?? 'Customer',
        detail: item.email ?? 'Customer',
        href: `/customers/${item.id}`,
        group: 'Customers',
      })),
      ...data.services.map((item) => ({
        id: `service-${item.id}`,
        label: item.name ?? 'Service',
        detail: item.duration_minutes ? `${item.duration_minutes} min` : 'Service',
        href: `/services/${item.id}`,
        group: 'Services',
      })),
      ...(canSearchStaff
        ? data.staff.map((item) => ({
            id: `staff-${item.id}`,
            label: item.full_name ?? 'Staff member',
            detail: item.status ?? 'Staff',
            href: `/staff/${item.id}`,
            group: 'Staff',
          }))
        : []),
    ];
  }, [searchResults.data, canSearchStaff]);

  const showSearchResults = searchOpen && debouncedSearch.length >= 2;

  const workspaceSnapshot = useMemo(
    () =>
      buildWorkspaceSnapshot({
        tenantId: workspace.tenantId,
        business: workspace.activeBusiness,
        activeProduct: workspace.activeProduct,
      }),
    [workspace.tenantId, workspace.activeBusiness, workspace.activeProduct],
  );

  const workspaceLabel = formatWorkspaceLabel(workspaceSnapshot);

  const businessName = workspaceSnapshot.businessName;

  const title = useAppShellTitle();

  const businessOptionsList = useMemo(() => businessOptions.data ?? [], [businessOptions.data]);
  const subscribedProducts = useMemo(
    () => getSubscribedProducts(workspace.activeBusiness?.product_subscriptions),
    [workspace.activeBusiness?.product_subscriptions],
  );

  const handleBusinessChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (!value || value === '__add__') return;
    workspace.setBusinessId(value);
  };

  return (
    <header className="app-shell-header">
      <div className="app-shell-header-copy">
        <div className="app-shell-header-kicker">Workspace</div>
        <h2>{title}</h2>
        <p>{workspaceLabel}</p>
      </div>

      <div className="app-shell-header-actions">
        <div className="app-shell-search-wrap">
          <label className="app-shell-search" aria-label="Global search">
            <Search size={16} />
            <input
              type="search"
              placeholder={canSearchStaff ? 'Search customers, services, staff' : 'Search customers, services'}
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
            />
          </label>
          {showSearchResults ? (
            <div className="app-shell-search-results" role="listbox" aria-label="Search results">
              {searchResults.isLoading ? <p className="app-shell-search-empty">Searching…</p> : null}
              {searchResults.error ? (
                <p className="app-shell-search-empty">{searchResults.error.message}</p>
              ) : null}
              {!searchResults.isLoading && !searchResults.error && searchItems.length === 0 ? (
                <p className="app-shell-search-empty">No matches for “{debouncedSearch}”.</p>
              ) : null}
              {searchItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="app-shell-search-result"
                  role="option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    navigate(item.href);
                    setSearchTerm('');
                    setDebouncedSearch('');
                    setSearchOpen(false);
                  }}
                >
                  <span className="app-shell-search-result-group">{item.group}</span>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="app-shell-header-controls">
          {showPlatformAdminLink ? (
            <Link
              to="/admin"
              className="app-shell-icon-button"
              aria-label="Platform Admin"
              title="Platform Admin"
            >
              <Shield size={18} />
            </Link>
          ) : null}
          <button
            type="button"
            className="app-shell-icon-button"
            aria-label="Notifications"
            onClick={() => navigate('/notifications')}
          >
            <Bell size={18} />
          </button>
          <div className="app-shell-workspace-switcher" aria-label="Workspace switcher">
            <label className="app-shell-workspace-field">
              <span>Products</span>
              {subscribedProducts.length > 0 ? (
                <div className="app-shell-workspace-empty" title={subscribedProducts.map((p) => p.name).join(', ')}>
                  {subscribedProducts.map((product) => product.name).join(' · ')}
                </div>
              ) : (
                <div className="app-shell-workspace-empty">No subscribed products</div>
              )}
              {canManageWorkspace ? (
                <Link to="/settings/products" className="app-shell-workspace-link">
                  {subscribedProducts.length > 0 ? 'Manage products' : 'Subscribe'}
                </Link>
              ) : null}
            </label>
            <label className="app-shell-workspace-field">
              <span>Business</span>
              <select
                value={workspace.businessId ?? ''}
                onChange={handleBusinessChange}
                disabled={businessOptions.isLoading}
              >
                {businessOptionsList.length === 0 ? (
                  <option value="">No businesses yet</option>
                ) : (
                  businessOptionsList.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.display_name ?? item.business_name ?? item.id}
                    </option>
                  ))
                )}
                <option value="__add__" disabled>──────────</option>
              </select>
              {canManageWorkspace ? (
                <Link to="/settings/business" className="app-shell-workspace-link">
                  Business profile
                </Link>
              ) : null}
            </label>
          </div>
        </div>
      </div>
    </header>
  );
}
