import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

// Source Sans 3, bundled with the app (SIL Open Font License); no font is fetched at run time.
import "@fontsource-variable/source-sans-3";
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
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
