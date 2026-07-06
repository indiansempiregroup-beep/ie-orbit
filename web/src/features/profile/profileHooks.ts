import { useAuth } from '../../hooks/useAuth';

export function useProfileDetails() {
  const auth = useAuth();
  return {
    user: auth.user,
    loading: auth.loading,
    logout: auth.logout,
  };
}
