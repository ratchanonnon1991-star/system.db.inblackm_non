import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import SystemDbScreen from "@/components/systemdb-screen";

export const metadata = {
  title: "GameDB — System DB",
};

// Same auth gate as /systemdb (see that route) -- this just also carries a
// template id in the URL, so a bookmark or a link someone shares opens
// straight into that template instead of whatever the workspace would
// otherwise restore. GamedbWorkspace itself resolves the id against the
// templates this signed-in user is allowed to see, and falls back to the
// normal startup flow with a notice if it isn't one of them.
export default async function ViewPage({ params }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  const viewId = Number(id);
  return <SystemDbScreen me={user} initialViewId={Number.isInteger(viewId) && viewId > 0 ? viewId : null} />;
}
