"use client";

import { createContext, useContext } from "react";

const ProjectmThemeContext = createContext(null);

export function ProjectmThemeProvider({ theme, toggleTheme, children }) {
  return (
    <ProjectmThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ProjectmThemeContext.Provider>
  );
}

export function useProjectmTheme() {
  const value = useContext(ProjectmThemeContext);
  if (!value) throw new Error("useProjectmTheme must be used inside ProjectmThemeProvider");
  return value;
}
