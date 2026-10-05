import type { ReactNode } from "react";

interface NoticeProps {
  tone?: "error" | "warning" | "info";
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}

/** An inline message. Errors are announced to assistive technology. */
export function Notice({ tone = "info", title, children, action }: NoticeProps) {
  return (
    <div className={`notice notice--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <div className="notice__body">
        {title ? <span className="notice__title">{title}</span> : null}
        {children ? <div>{children}</div> : null}
        {action ? <div>{action}</div> : null}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
}

export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className="empty">
      <span className="empty__title">{title}</span>
      {children ? <span className="small">{children}</span> : null}
    </div>
  );
}
