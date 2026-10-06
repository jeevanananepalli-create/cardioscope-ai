import type { Theme } from "@/hooks/useTheme";
import { TAGLINE } from "@/lib/constants";

export type ServiceStatus = "checking" | "ok" | "models_unavailable" | "unreachable";

const STATUS_TEXT: Record<ServiceStatus, string> = {
  checking: "Connecting to service…",
  ok: "Models ready",
  models_unavailable: "Models not available",
  unreachable: "Service unreachable",
};

interface AppHeaderProps {
  status: ServiceStatus;
  modelVersion: string | null;
  theme?: Theme;
  onToggleTheme?: () => void;
}

export function AppHeader({ status, modelVersion, theme = "light", onToggleTheme }: AppHeaderProps) {
  const tone = status === "ok" ? "badge--ok" : status === "checking" ? "" : "badge--problem";
  return (
    <header className="app-header">
      <div className="brand">
        <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
          <path
            d="M16 27C7.5 20.6 5 16.4 5 12.4A5.6 5.6 0 0 1 16 10.6 5.6 5.6 0 0 1 27 12.4c0 4-2.5 8.2-11 14.6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 16.5h4.2l1.7-3.6 2.9 6.6 1.6-3h4.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="brand__text">
          <h1 className="brand__name">
            CardioScope <span>AI</span>
          </h1>
          <p className="brand__tagline">{TAGLINE}</p>
        </div>
      </div>
      <div className="app-header__meta">
        <span className="badge badge--research">Research prototype · not a medical device</span>
        {modelVersion ? <span className="badge num">Model v{modelVersion}</span> : null}
        <span className={`badge ${tone}`} role="status">
          <span className="badge__dot" aria-hidden="true" />
          {STATUS_TEXT[status]}
        </span>
        {onToggleTheme ? (
          <button
            type="button"
            className="icon-button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Light theme" : "Dark theme"}
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path
                  d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        ) : null}
      </div>
    </header>
  );
}
