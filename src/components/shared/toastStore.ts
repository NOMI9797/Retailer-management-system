// A tiny module-level pub/sub, not React state — deliberately so a
// toast triggered right before a redirect/unmount (e.g. NewSaleForm's
// router.push after a successful sale) survives the navigation. React
// state tied to the form's own component tree would just disappear
// the instant that tree unmounts; this store lives outside any one
// component's lifecycle, and ToastHost (mounted once in the dashboard
// layout) is the only thing that ever reads it.
export type ToastVariant = "success" | "error";

export type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener(toasts);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}

export function showToast(message: string, variant: ToastVariant = "success") {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  toasts = [...toasts, { id, message, variant }];
  notify();
  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}
