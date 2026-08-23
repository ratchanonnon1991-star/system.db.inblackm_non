"use client";

import { createContext, useContext } from "react";

const ProfitThemeContext = createContext(null);

export function ProfitThemeProvider({ theme, toggleTheme, children }) {
  return (
    <ProfitThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ProfitThemeContext.Provider>
  );
}

export function useProfitTheme() {
  const value = useContext(ProfitThemeContext);
  if (!value) throw new Error("useProfitTheme must be used inside ProfitThemeProvider");
  return value;
}
