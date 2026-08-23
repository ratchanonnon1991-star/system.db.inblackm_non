"use client";

import { createContext, useContext } from "react";

// Set once by ProfitShell (from the server layout's canManageProfit(user)
// check) so every page under /profit can decide whether to show edit
// controls without each one re-fetching /api/me on its own.
const ProfitCapabilitiesContext = createContext(false);

export function ProfitCapabilitiesProvider({ canEdit, children }) {
  return (
    <ProfitCapabilitiesContext.Provider value={canEdit}>
      {children}
    </ProfitCapabilitiesContext.Provider>
  );
}

export function useProfitCanEdit() {
  return useContext(ProfitCapabilitiesContext);
}
