import { Navigate, Outlet } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { isProductAllowed } from '../config/navigation';

type ProductGuardProps = {
  products: string[];
};

/** Route guard — redirects when active product is not licensed for the route. */
export function ProductGuard({ products }: ProductGuardProps) {
  const workspace = useWorkspace();
  const activeProduct = workspace.activeProduct ?? workspace.activeBusiness?.selected_product ?? 'appointie';
  if (!isProductAllowed(products, activeProduct)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
