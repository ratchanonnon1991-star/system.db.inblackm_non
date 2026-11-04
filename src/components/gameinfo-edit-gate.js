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

// Going from a game's page into editing it passes through the day's notices:
// the CEO's, the Bot Auto warning for a bot game, and the reminder to check
// every platform afterwards. The way in is the game card's link, which asks
// the gate on the page; the gate navigates once they are answered.
const EDIT_REQUEST = "gameinfo:edit-request";
const CEO_REQUEST = "gameinfo:ceo";

/** Call from an edit link's click: true when the page's gate took it over. */
export function requestGameinfoEdit(event, href) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return false;
  const taken = !window.dispatchEvent(new CustomEvent(EDIT_REQUEST, { detail: { href }, cancelable: true }));
  if (taken) event.preventDefault();
  return taken;
}

/** Shows the CEO's notice again, whenever someone wants to read it. */
export function GameinfoCeoButton() {
  return (
    <button type="button" className="gd-ceo-btn" aria-label="ดูประกาศจาก CEO" title="ประกาศจาก CEO" onClick={() => window.dispatchEvent(new Event(CEO_REQUEST))}>
      <Megaphone size={17} aria-hidden="true" />
    </button>
  );
}

export default function GameinfoEditGate({ botAuto = false, channels = [], className = "" }) {
  const router = useRouter();
  const notices = useGameinfoNoticeChain(className);
  // The handlers below stay registered once; they read the latest props here.
  const latest = useRef({ notices, botAuto, channels });
  useEffect(() => {
    latest.current = { notices, botAuto, channels };
  });

  useEffect(() => {
    function onEdit(event) {
      event.preventDefault();
      const { notices: chain, botAuto: bot, channels: names } = latest.current;
      chain.run(
        [GAMEINFO_CEO_NOTICE, ...(bot ? [GAMEINFO_BOT_NOTICE] : []), gameinfoPlatformNotice(names)],
        () => router.replace(event.detail.href)
      );
    }
    function onCeo() {
      latest.current.notices.run([GAMEINFO_CEO_NOTICE], null, { force: false, always: true });
    }
    window.addEventListener(EDIT_REQUEST, onEdit);
    window.addEventListener(CEO_REQUEST, onCeo);
    return () => {
      window.removeEventListener(EDIT_REQUEST, onEdit);
      window.removeEventListener(CEO_REQUEST, onCeo);
    };
  }, [router]);

  return notices.node;
}
