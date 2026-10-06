import { SAFETY_DISCLAIMER } from "@/lib/constants";

/** Always-visible safety statement. */
export function SafetyDisclaimer() {
  return (
    <div className="disclaimer" role="note" aria-label="Safety disclaimer">
      <svg className="disclaimer__icon" viewBox="0 0 20 20" aria-hidden="true">
        <path
          fill="currentColor"
          d="M10 1.8 1.2 17h17.6L10 1.8Zm0 4.6c.5 0 .9.4.9.9l-.3 5a.6.6 0 0 1-1.2 0l-.3-5c0-.5.4-.9.9-.9Zm0 7.4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"
        />
      </svg>
      <p>
        <strong>Research and education prototype.</strong> {SAFETY_DISCLAIMER}
      </p>
    </div>
  );
}
