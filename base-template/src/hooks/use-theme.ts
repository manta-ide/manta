"use client";
import { useEffect, useState } from "react";

// Simple dark / light theme toggler using the `dark` class on <html>
export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(false);
  const [isClient, setIsClient] = useState<boolean>(false);

  useEffect(() => {
    // Mark as client-side and defer DOM access to avoid hydration mismatches
    setIsClient(true);
    
    // Defer DOM access to next tick
    setTimeout(() => {
      const root = document.documentElement;
      const initial = root.classList.contains("dark");
      setIsDark(initial);
    }, 0);
  }, []);

  useEffect(() => {
    // Only modify DOM after client-side hydration
    if (!isClient) return;
    
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDark, isClient]);

  return {
    isDark,
    toggle: () => setIsDark((v) => !v),
  };
}
