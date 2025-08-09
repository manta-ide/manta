"use client";
import { useEffect, useState } from "react";

// Simple dark / light theme toggler using the `dark` class on <html>
export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    // Initialise from system or attribute
    const root = document.documentElement;
    const initial = root.classList.contains("dark");
    setIsDark(initial);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDark]);

  return {
    isDark,
    toggle: () => setIsDark((v) => !v),
  };
}
