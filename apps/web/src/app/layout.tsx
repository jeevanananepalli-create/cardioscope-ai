import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "CardioScope AI — Cardiovascular Risk Visualization & Prediction",
  description:
    "Research and education prototype that maps model-predicted coronary artery disease risk onto an interactive 3D view. Not a medical device.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
