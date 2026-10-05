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
}

export function AppHeader({ status, modelVersion }: AppHeaderProps) {
  const tone = status === "ok" ? "badge--ok" : status === "checking" ? "" : "badge--problem";
  return (
    <header className="app-header">
      <div className="brand">
        <h1 className="brand__name">
          CardioScope <span>AI</span>
        </h1>
        <p className="brand__tagline">{TAGLINE}</p>
      </div>
      <div className="app-header__meta">
        <span className="badge badge--research">Research prototype · not a medical device</span>
        {modelVersion ? <span className="badge num">Model v{modelVersion}</span> : null}
        <span className={`badge ${tone}`} role="status">
          <span className="badge__dot" aria-hidden="true" />
          {STATUS_TEXT[status]}
        </span>
      </div>
    </header>
  );
}
