import { useSnackbarContext } from '../contexts/SnackbarContext';

export function useSnackbar() {
  return useSnackbarContext();
}
