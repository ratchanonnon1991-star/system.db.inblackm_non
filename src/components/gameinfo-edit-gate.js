"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Megaphone } from "lucide-react";
import {
  GAMEINFO_BOT_NOTICE,
  GAMEINFO_CEO_NOTICE,
  gameinfoPlatformNotice,
  useGameinfoNoticeChain,
} from "./gameinfo-notice-chain";

// Editing a game starts with the day's notices: the CEO's, the Bot Auto
// warning for a bot game, and the reminder to check every platform after the
// change. They show on the edit page itself, so every way in meets them;
// cancelling goes back to the game's page.
const CEO_REQUEST = "gameinfo:ceo";

export default function GameinfoEditGate({ botAuto = false, channels = [], cancelHref, className = "" }) {
  const router = useRouter();
  const notices = useGameinfoNoticeChain(className);
  const run = useRef(notices.run);
  useEffect(() => {
    run.current = notices.run;
  });
  useEffect(() => {
    run.current(
      [GAMEINFO_CEO_NOTICE, ...(botAuto ? [GAMEINFO_BOT_NOTICE] : []), gameinfoPlatformNotice(channels)],
      null,
      { onCancel: () => router.replace(cancelHref) }
    );
    // Once per visit to the edit page, with what it opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return notices.node;
}

/** Shows the CEO's notice again, whenever someone wants to read it. */
export function GameinfoCeoButton() {
  return (
    <button type="button" className="gd-ceo-btn" aria-label="ดูประกาศจาก CEO" title="ประกาศจาก CEO" onClick={() => window.dispatchEvent(new Event(CEO_REQUEST))}>
      <Megaphone size={17} aria-hidden="true" />
    </button>
  );
}

/** Where the CEO button's notice opens, on the game's page. */
export function GameinfoCeoNotice({ className = "" }) {
  const notices = useGameinfoNoticeChain(className);
  const run = useRef(notices.run);
  useEffect(() => {
    run.current = notices.run;
  });
  useEffect(() => {
    function onCeo() {
      run.current([GAMEINFO_CEO_NOTICE], null, { force: false, always: true });
    }
    window.addEventListener(CEO_REQUEST, onCeo);
    return () => window.removeEventListener(CEO_REQUEST, onCeo);
  }, []);
  return notices.node;
}
