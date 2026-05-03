"use client";
import { createContext, useContext, useEffect, useState } from "react";

export const THEMES = [
  { key: "emerald", label: "Emerald", color: "#10b981" },
  { key: "indigo",  label: "Indigo",  color: "#6366f1" },
  { key: "purple",  label: "Purple",  color: "#a855f7" },
  { key: "rose",    label: "Rose",    color: "#f43f5e" },
  { key: "amber",   label: "Amber",   color: "#f59e0b" },
  { key: "cyan",    label: "Cyan",    color: "#06b6d4" },
];

type ThemeCtx = { theme: string; setTheme: (t: string) => void };
const ThemeContext = createContext<ThemeCtx>({ theme: "emerald", setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState("emerald");

  useEffect(() => {
    const saved = localStorage.getItem("app-theme") ?? "emerald";
    setThemeState(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  function setTheme(t: string) {
    setThemeState(t);
    localStorage.setItem("app-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
