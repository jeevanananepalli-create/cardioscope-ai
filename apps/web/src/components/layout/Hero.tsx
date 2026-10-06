"use client";

import { AnatomyViewer } from "@/components/anatomy/AnatomyViewer";
import { useAnatomy } from "@/hooks/useAnatomy";
import { FALLBACK_RISK_CATEGORIES, SAFETY_DISCLAIMER } from "@/lib/constants";

interface HeroProps {
  onStart: () => void;
}

const STEPS = ["Predict CAD risk", "Visualize on a 3D heart", "Understand why"];

/** Landing page: what the prototype does, with the reference heart (no prediction shown). */
export function Hero({ onStart }: HeroProps) {
  const anatomy = useAnatomy();
  return (
    <main className="hero">
      <div className="hero__text">
        <h2 className="hero__title">
          From Clinical Data
          <br />
          to <span>Cardiac Clarity</span>
        </h2>
        <p className="hero__lead">
          Machine-learning cardiovascular risk prediction with interactive 3D visualization and explainability.
        </p>
        <button type="button" className="button button--primary hero__cta" onClick={onStart}>
          Start Analysis
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <ul className="hero__steps">
          {STEPS.map((step, index) => (
            <li key={step}>
              <span className="hero__step-mark" aria-hidden="true">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ul>
        <p className="hero__disclaimer">{SAFETY_DISCLAIMER}</p>
      </div>
      <div className="hero__visual">
        <AnatomyViewer vessels={null} categories={FALLBACK_RISK_CATEGORIES} anatomy={anatomy} minimal />
        <p className="hero__visual-note">Generic reference anatomy. Drag to rotate.</p>
      </div>
    </main>
  );
}
