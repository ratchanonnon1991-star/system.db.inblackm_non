import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import { canManageProfit, hasProfitAccess } from "@/server/auth";
import ProfitThemeRoot from "@/components/profit-theme-root";
import ProfitShell from "@/components/profit-shell";

export default async function ProfitLayout({ children }) {
  const user = await getSessionUser();
  if (!hasProfitAccess(user)) redirect("/");

  return (
    <ProfitThemeRoot>
      <ProfitShell displayName={user.displayName || user.username} canEdit={canManageProfit(user)}>
        {children}
      </ProfitShell>
    </ProfitThemeRoot>
  );
}
