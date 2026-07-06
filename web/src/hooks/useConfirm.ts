import { useConfirmContext } from '../contexts/ConfirmContext';

export function useConfirm() {
  const ctx = useConfirmContext();
  return ctx.confirm;
}
