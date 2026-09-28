"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { subscribeToasts, dismissToast, type Toast } from "./toastStore";

const AUTO_DISMISS_MS = 2000;

// Mounted once in the dashboard layout (not per-page) so a popup
// triggered right before a redirect survives the navigation — see
// toastStore's comment for why this isn't plain component state. A
// centered confirmation card over a soft backdrop, not a corner
// toast — reads as a deliberate confirmation rather than a passive
// notification, while still auto-dismissing so it never blocks a busy
// shopkeeper's flow. Only ever shows the most recent popup at a time;
// a second one replaces the first rather than stacking, since two
// centered popups on screen at once would compete for attention.
//
// The state update from a toastStore notification is wrapped in
// flushSync — every caller shows a toast immediately before calling
// router.refresh()/router.push(), and without flushSync that state
// update and the navigation both land in the same React batch/tick,
// so the navigation's re-render can win the race and the popup never
// actually paints. flushSync forces this component to commit and
// paint synchronously before the calling code's next line runs.
export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    // subscribeToasts calls the listener once synchronously, right
    // here inside this effect's own commit — flushSync can't be used
    // for that first call (React is already rendering/committing),
    // only for genuine later notifications triggered by some other
    // component's event handler calling showToast/dismissToast.
    let isFirstCall = true;
    return subscribeToasts((next) => {
      if (isFirstCall) {
        isFirstCall = false;
        setToasts(next);
      } else {
        flushSync(() => setToasts(next));
      }
    });
  }, []);

  const current = toasts[toasts.length - 1] ?? null;

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => dismissToast(current.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  return (
    <div className="toast-backdrop" onClick={() => dismissToast(current.id)}>
      <div className={`toast-popup toast-${current.variant}`} role="status">
        <div className="toast-popup-icon">
          <svg className="icon" viewBox="0 0 24 24" strokeWidth={2.5}>
            {current.variant === "success" ? (
              <path d="M4 12l6 6L20 6" />
            ) : (
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </>
            )}
          </svg>
        </div>
        <p>{current.message}</p>
      </div>
    </div>
  );
}
