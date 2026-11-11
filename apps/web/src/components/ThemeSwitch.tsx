import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("mz-theme");
      if (saved === "light" || saved === "dark") {
        return saved;
      }
    } catch {
      // ignore
    }
    return "system";
  });

  const applyTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    try {
      if (nextTheme === "system") {
        localStorage.removeItem("mz-theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("mz-theme", nextTheme);
        document.documentElement.dataset.theme = nextTheme;
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    // Listen for OS scheme change when in system mode
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      try {
        const saved = localStorage.getItem("mz-theme");
        if (!saved || saved === "system") {
          delete document.documentElement.dataset.theme;
        }
      } catch {
        // ignore
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="theme-switch" role="group" aria-label="Visual Theme">
      <button
        type="button"
        className={`theme-btn ${theme === "light" ? "active" : ""}`}
        aria-pressed={theme === "light"}
        onClick={() => applyTheme("light")}
      >
        Light
      </button>
      <button
        type="button"
        className={`theme-btn ${theme === "dark" ? "active" : ""}`}
        aria-pressed={theme === "dark"}
        onClick={() => applyTheme("dark")}
      >
        Dark
      </button>
      <button
        type="button"
        className={`theme-btn ${theme === "system" ? "active" : ""}`}
        aria-pressed={theme === "system"}
        onClick={() => applyTheme("system")}
      >
        System
      </button>
    </div>
  );
}

