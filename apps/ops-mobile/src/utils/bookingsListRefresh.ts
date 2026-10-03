/** Lightweight pub/sub so booking mutations can refresh list screens reliably. */

type Listener = () => void;

let revision = 0;
const listeners = new Set<Listener>();

export function getBookingsListRevision(): number {
  return revision;
}

export function bumpBookingsListRevision(): void {
  revision += 1;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore listener errors */
    }
  });
}

export function subscribeBookingsListRevision(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
