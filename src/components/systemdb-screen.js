"use client";

import { useRouter } from "next/navigation";
import GamedbWorkspace from "@/components/gamedb-workspace";

// The workspace itself only knows about onLoggedOut/onBackToMenu callbacks,
// not about routing -- this is the one place that turns those into
// navigation, so GamedbWorkspace stays usable outside a Next.js route too.
// GamedbWorkspace already calls /api/auth/logout itself before invoking
// onLoggedOut, so this only needs to send the browser back to the hub.
export default function SystemDbScreen({ me }) {
  const router = useRouter();

  return (
    <GamedbWorkspace
      me={me}
      onLoggedOut={() => router.push("/")}
      onBackToMenu={() => router.push("/")}
    />
  );
}
