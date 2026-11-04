"use client";

import { useSyncExternalStore } from "react";
import { ChevronDown, KeyRound, Layers, Store, TriangleAlert } from "lucide-react";

// Icons by name: the page that lays the folds out is a server component and
// cannot hand a component over to this one.
const ICONS = { layers: Layers, store: Store, key: KeyRound, alert: TriangleAlert };

// Which folds a person closed, kept in this browser for every game.
const STORAGE_KEY = "gameinfo-folds";
const listeners = new Set();
let snapshot = null;

function readFolds() {
  if (snapshot === null) {
    try {
      snapshot = window.localStorage.getItem(STORAGE_KEY) || "{}";
    } catch {
      snapshot = "{}";
    }
  }
  return snapshot;
}

function parseFolds(text) {
  try {
    return JSON.parse(text) || {};
  } catch {
    return {};
  }
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opens or closes a fold from elsewhere on the page (the Bot Auto notice opens the pack list). */
export function setGameinfoFoldClosed(id, closed) {
  snapshot = JSON.stringify({ ...parseFolds(readFolds()), [id]: closed });
  try {
    window.localStorage.setItem(STORAGE_KEY, snapshot);
  } catch {
    // Private windows refuse storage; the fold still works for this visit.
  }
  listeners.forEach((listener) => listener());
}

/** A card, or a card inside a card (`sub`), whose body folds away under its title. */
export default function GameinfoFold({ id, title, subtitle = "", icon = "", tone = "red", sub = false, defaultClosed = false, children }) {
  const stored = parseFolds(useSyncExternalStore(subscribe, readFolds, () => "{}"))[id];
  const closed = stored === undefined ? defaultClosed : stored;
  const Icon = ICONS[icon];
  return (
    <section className={`${sub ? "gd-sub" : "gd-card"} gd-fold${closed ? " closed" : ""}`}>
      <button type="button" className="gd-fold-h" aria-expanded={!closed} onClick={() => setGameinfoFoldClosed(id, !closed)}>
        {Icon ? (
          <span className={`gd-fh-ic ${tone}`}>
            <Icon size={18} aria-hidden="true" />
          </span>
        ) : null}
        <span className="gd-fh-t">
          <b>{title}</b>
          {subtitle ? <small>{subtitle}</small> : null}
        </span>
        <ChevronDown size={18} aria-hidden="true" className="gd-chev" />
      </button>
      <div className="gd-fold-b">
        <div className="gd-fold-bi" inert={closed}>
          <div className="gd-pad">{children}</div>
        </div>
      </div>
    </section>
  );
}
