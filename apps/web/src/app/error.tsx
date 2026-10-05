"use client";

import { SafetyDisclaimer } from "@/components/dashboard/SafetyDisclaimer";

/** Last-resort screen if the whole page fails to render. Never a blank page, never a stack trace. */
export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="app">
      <SafetyDisclaimer />
      <main className="bottom" style={{ paddingTop: 24 }}>
        <div className="notice notice--error" role="alert">
          <div className="notice__body">
            <span className="notice__title">CardioScope AI could not display this page.</span>
            <span>Reload the page. If the problem continues, restart the application.</span>
            <div>
              <button className="button" type="button" onClick={reset}>
                Reload
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
