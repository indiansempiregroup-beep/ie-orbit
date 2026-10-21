type Listener = () => void;

const listeners = new Set<Listener>();

export function bumpRoleMenusRevision(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeRoleMenusRevision(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
