import type { ReactNode } from "react";

export interface BannerProps {
  children: ReactNode;
  onDismiss: () => void;
}

// A dismissible alert banner, reused wherever a page shows a load/action
// error (Trades list, Trade detail).
export function Banner({ children, onDismiss }: BannerProps) {
  return (
    <div role="alert" className="banner">
      <span className="banner-message">{children}</span>
      <button type="button" onClick={onDismiss} className="banner-dismiss" aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
