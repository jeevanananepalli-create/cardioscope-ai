export type AppView = "home" | "analyze" | "model" | "about";

interface MainNavProps {
  view: AppView;
  onNavigate: (view: AppView) => void;
}

const ITEMS: { key: AppView; label: string; icon: string }[] = [
  { key: "home", label: "Home", icon: "M4 11.5 12 4l8 7.5M6.5 10v9.5h11V10" },
  { key: "analyze", label: "Analyze", icon: "M3.5 12.5h4l2-5 4 10 2-5h5" },
  { key: "model", label: "Model", icon: "M5 20V10m7 10V4m7 16v-7" },
  { key: "about", label: "About", icon: "M12 11v6m0-9.5v.5M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z" },
];

/** The four pages of the app. A top bar in the light theme, a side rail in the dark one. */
export function MainNav({ view, onNavigate }: MainNavProps) {
  return (
    <nav className="main-nav" aria-label="Main">
      {ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="main-nav__item"
          aria-current={view === item.key ? "page" : undefined}
          onClick={() => onNavigate(item.key)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={item.icon} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
