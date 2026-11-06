"use client";

import { useEffect, useRef } from "react";
import { Megaphone } from "lucide-react";
import { GAMEINFO_CEO_NOTICE, useGameinfoNoticeChain } from "./gameinfo-notice-chain";

// The CEO's notice. It shows every time someone arrives at a game's page:
// leaving the page and coming back shows it again, but a refresh of the page
// once it was acknowledged does not, and nor does coming back from editing
// that game. The edit page shows it only to whoever has not acknowledged it
// in this tab yet (someone opening it straight from a link). It can only be
// closed with the button drawn in the picture.
const CEO_REQUEST = "gameinfo:ceo";
// sessionStorage, so per tab: the page whose notice was acknowledged and has
// not been left since, and whether this tab acknowledged it at all.
const ACK_PAGE_KEY = "gameinfo-ceo-ack-page";
const ACK_TAB_KEY = "gameinfo-ceo-ack-tab";
// The game page the edit page on screen belongs to: going back to it from
// editing is not a new arrival.
const FROM_EDIT_KEY = "gameinfo-ceo-from-edit";

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
// How long after a game page unmounts to look where the browser went.
const LEAVE_CHECK_MS = 300;
let editPagesOnScreen = 0;
// How long a page left behind keeps its claim: the next page mounts in the
// same render after a move inside the app, well within this.
const LEAVE_GRACE_MS = 1000;

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
    const gamePage = window.location.pathname.replace(/\/manage\/?$/, "");
    editPagesOnScreen += 1;
    writeSession(FROM_EDIT_KEY, gamePage);
    if (!readSession(ACK_TAB_KEY)) run.current([GAMEINFO_CEO_NOTICE], () => acknowledge(gamePage), { always: true });
    return () => {
      editPagesOnScreen -= 1;
      // Gone somewhere other than its game page: forget it.
      setTimeout(() => {
        if (editPagesOnScreen === 0 && readSession(FROM_EDIT_KEY) === gamePage) writeSession(FROM_EDIT_KEY, "");
      }, LEAVE_GRACE_MS);
    };
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
    const fromEdit = readSession(FROM_EDIT_KEY) === page;
    if (fromEdit) {
      writeSession(FROM_EDIT_KEY, "");
      writeSession(ACK_PAGE_KEY, page);
    }
    const acknowledgedHere = readSession(ACK_PAGE_KEY) === page;
    // Back from editing this game, a refresh of an acknowledged page, or the
    // same page mounted again without leaving it (its acknowledgement is only
    // cleared on leaving).
    const stillHere = fromEdit || (acknowledgedHere && (firstPageShown || pageWasReloaded()));
    firstPageShown = true;
    if (!stillHere) run.current([GAMEINFO_CEO_NOTICE], () => acknowledge(page), { always: true });
    return () => {
      pagesOnScreen -= 1;
      // Only leaving the page counts: switching Product / Topup or UID /
      // ID-Pass mounts the same page again at the same address.
      setTimeout(() => {
        if (pagesOnScreen === 0 && window.location.pathname !== page && readSession(ACK_PAGE_KEY) === page) writeSession(ACK_PAGE_KEY, "");
      }, LEAVE_CHECK_MS);
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
