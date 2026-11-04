"use client";

import { useEffect, useRef } from "react";
import { Megaphone } from "lucide-react";
import { GAMEINFO_CEO_NOTICE, useGameinfoNoticeChain } from "./gameinfo-notice-chain";

// The CEO's notice. It shows every time someone arrives at a game's page:
// leaving the page and coming back shows it again, a refresh of the page
// once it was acknowledged does not. The edit page shows it only to whoever
// has not acknowledged it in this tab yet (someone opening it straight from
// a link). It can only be closed with the button drawn in the picture.
const CEO_REQUEST = "gameinfo:ceo";
// sessionStorage, so per tab: the page whose notice was acknowledged and has
// not been left since, and whether this tab acknowledged it at all.
const ACK_PAGE_KEY = "gameinfo-ceo-ack-page";
const ACK_TAB_KEY = "gameinfo-ceo-ack-tab";

function readSession(key) {
  try {
    return window.sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeSession(key, value) {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Without storage the notice simply shows again.
  }
}

function pageWasReloaded() {
  try {
    return window.performance.getEntriesByType("navigation")[0]?.type === "reload";
  } catch {
    return false;
  }
}

function acknowledge(page) {
  writeSession(ACK_PAGE_KEY, page);
  writeSession(ACK_TAB_KEY, "1");
}

// Game pages on screen right now. Leaving one clears its acknowledgement a
// moment later, unless it is back by then: React mounts twice in development,
// and switching UID / ID-Pass mounts the same page again.
let pagesOnScreen = 0;
// The first game page since the document loaded is the one a refresh brings
// back; later ones were reached inside the app.
let firstPageShown = false;

function useNoticeRun(className) {
  const notices = useGameinfoNoticeChain(className);
  const run = useRef(notices.run);
  useEffect(() => {
    run.current = notices.run;
  });
  return [notices, run];
}

export default function GameinfoEditGate({ className = "" }) {
  const [notices, run] = useNoticeRun(className);
  useEffect(() => {
    if (readSession(ACK_TAB_KEY)) return;
    const page = window.location.pathname;
    run.current([GAMEINFO_CEO_NOTICE], () => acknowledge(page), { always: true });
  }, [run]);
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

/** On the game's page: the notice on every arrival, and again whenever the CEO button asks. */
export function GameinfoCeoNotice({ className = "" }) {
  const [notices, run] = useNoticeRun(className);
  useEffect(() => {
    const page = window.location.pathname;
    pagesOnScreen += 1;
    const acknowledgedHere = readSession(ACK_PAGE_KEY) === page;
    // A refresh of an acknowledged page, or the same page mounted again
    // without leaving it (its acknowledgement is only cleared on leaving).
    const stillHere = acknowledgedHere && (firstPageShown || pageWasReloaded());
    firstPageShown = true;
    if (!stillHere) run.current([GAMEINFO_CEO_NOTICE], () => acknowledge(page), { always: true });
    return () => {
      pagesOnScreen -= 1;
      setTimeout(() => {
        if (pagesOnScreen === 0 && readSession(ACK_PAGE_KEY) === page) writeSession(ACK_PAGE_KEY, "");
      }, 0);
    };
  }, [run]);
  useEffect(() => {
    function onCeo() {
      run.current([GAMEINFO_CEO_NOTICE], null, { force: false, always: true });
    }
    window.addEventListener(CEO_REQUEST, onCeo);
    return () => window.removeEventListener(CEO_REQUEST, onCeo);
  }, [run]);
  return notices.node;
}
