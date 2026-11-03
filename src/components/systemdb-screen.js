"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import GamedbWorkspace from "@/components/gamedb-workspace";
import SystemDbWorkbench from "@/components/systemdb-workbench";

// The workspace itself only knows about onLoggedOut/onBackToMenu callbacks,
// not about routing -- this is the one place that turns those into
// navigation, so GamedbWorkspace stays usable outside a Next.js route too.
// GamedbWorkspace already calls /api/auth/logout itself before invoking
// onLoggedOut, so this only needs to send the browser back to the hub.
export default function SystemDbScreen({ me, initialViewId }) {
  const router = useRouter();
  const [builder, setBuilder] = useState(false);

  if (!builder) return <SystemDbWorkbench me={me} initialViewId={initialViewId} onBackToMenu={() => router.push("/")} onOpenBuilder={() => setBuilder(true)} />;

  return (
    <>
    <button type="button" onClick={() => setBuilder(false)} className="sdb-return-to-workbench">กลับหน้าตารางใหม่</button>
    <GamedbWorkspace
      me={me}
      initialViewId={initialViewId}
      onLoggedOut={() => router.push("/")}
      onBackToMenu={() => router.push("/")}
    />
    </>
  );
}
