"use client";

import { useEffect, useRef } from "react";
import { Megaphone } from "lucide-react";
import { GAMEINFO_CEO_NOTICE, useGameinfoNoticeChain } from "./gameinfo-notice-chain";

// The CEO's notice, once a day per browser: on the first visit to a game's
// page, and on the edit page for whoever came straight there. It cannot be
// dismissed, only acknowledged with the button in the picture.
const CEO_REQUEST = "gameinfo:ceo";

/** The day's CEO notice when the page opens, unless it was acknowledged today. */
function useCeoNoticeOnOpen(className) {
  const notices = useGameinfoNoticeChain(className);
  const run = useRef(notices.run);
  useEffect(() => {
    run.current = notices.run;
  });
  useEffect(() => {
    run.current([GAMEINFO_CEO_NOTICE], null);
  }, []);
  return notices;
}

export default function GameinfoEditGate({ className = "" }) {
  return useCeoNoticeOnOpen(className).node;
}

/** Shows the CEO's notice again, whenever someone wants to read it. */
export function GameinfoCeoButton() {
  return (
    <button type="button" className="gd-ceo-btn" aria-label="ดูประกาศจาก CEO" title="ประกาศจาก CEO" onClick={() => window.dispatchEvent(new Event(CEO_REQUEST))}>
      <Megaphone size={17} aria-hidden="true" />
    </button>
  );
}

/** On the game's page: the day's notice on arrival, and again whenever the CEO button asks. */
export function GameinfoCeoNotice({ className = "" }) {
  const notices = useCeoNoticeOnOpen(className);
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
