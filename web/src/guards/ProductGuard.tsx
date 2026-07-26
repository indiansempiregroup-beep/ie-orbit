import { Navigate, Outlet } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { isProductAllowed } from '../config/navigation';
import { getSubscribedProductIds } from '../config/products';

type ProductGuardProps = {
  products: string[];
};

/** Route guard — allows access when any required product is in the active subscription union. */
export function ProductGuard({ products }: ProductGuardProps) {
  const workspace = useWorkspace();
  const activeProduct = workspace.activeProduct ?? workspace.activeBusiness?.selected_product ?? 'appointie';
  const subscribedIds = getSubscribedProductIds(workspace.activeBusiness?.product_subscriptions);
  if (!isProductAllowed(products, activeProduct, subscribedIds)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
