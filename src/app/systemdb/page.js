import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import SystemDbScreen from "@/components/systemdb-screen";

export const metadata = {
  title: "GameDB — System DB",
};

// Session check happens here, server-side, the same way /gameinfo does it --
// an unauthenticated request never reaches the client bundle that renders
// the workspace at all.
export default async function SystemDbPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  return <SystemDbScreen me={user} />;
}
