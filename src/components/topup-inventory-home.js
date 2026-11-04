"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight, BellRing, BookmarkCheck, ChevronLeft, CircleArrowUp, CircleDollarSign, CirclePlus, Coins, Contrast, CreditCard, Gamepad2,
  Landmark, ListChecks, Moon, Music, Search, Shell, Smartphone, Star, Sun, Wallet, X,
} from "lucide-react";
import { useProjectmTheme } from "@/components/projectm-theme-context";
import {
  TOPUP_INVENTORY_CURRENCIES, TOPUP_INVENTORY_GROUPS, TOPUP_INVENTORY_PROVIDERS, topupInventoryMatch, topupInventoryPath,
} from "@/lib/topup-inventory";
import { TOPUP_INVENTORY_STATS, topupInventoryStats } from "@/lib/topup-inventory-stats";
import "./topup-inventory-home.css";

const ICONS = { reserve: BookmarkCheck, up: CircleArrowUp, list: ListChecks, bell: BellRing, pad: Gamepad2, wallet: Wallet, coins: Coins, shell: Shell, music: Music, usd: CircleDollarSign, cards: CreditCard, phone: Smartphone, bank: Landmark };
const THEMES = [{ key: "light", label: "สว่าง", Icon: Sun }, { key: "auto", label: "ตามระบบ", Icon: Contrast }, { key: "dark", label: "มืด", Icon: Moon }];
const PINS_KEY = "tiv-pins";
const RECENT_KEY = "tiv-recent";
const GROUP_OF = Object.fromEntries(TOPUP_INVENTORY_GROUPS.map((group) => [group.key, group]));
const PROVIDER = Object.fromEntries(TOPUP_INVENTORY_PROVIDERS.map((provider) => [provider.key, provider]));

const icon = (Icon, size = "1em") => <Icon className="tiv-i" size={size} aria-hidden />;

// Pins and recent visits are this browser's own conveniences: unreadable storage means none.
function readKeys(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((item) => PROVIDER[item]?.ready) : [];
  } catch {
    return [];
  }
}
function writeKeys(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* not kept */ }
}

function ProviderIcon({ provider, className }) {
  if (!provider.logo) return <div className={className}>{icon(ICONS[provider.icon] || Wallet)}</div>;
  const look = `${className} logo${provider.darkLogo ? " dk" : ""}${provider.fullLogo ? " full" : ""}`;
  // eslint-disable-next-line @next/next/no-img-element -- a 46px logo from /public needs no image optimisation
  return <div className={look}><img src={`/topup-inventory/${provider.logo}`} alt="" /></div>;
}

function Tile({ provider, href, hue, order, pinned, onPin, onOpen }) {
  const soon = !provider.ready;
  return (
    <article className={`tiv-tile${soon ? " soon" : ""}`} data-hue={hue} data-inventory-state={soon ? "coming-soon" : undefined} style={{ "--k": order }}>
      <div className="tiv-wm" aria-hidden>{icon(ICONS[provider.icon] || Wallet)}</div>
      <div className="tiv-t-top">
        <ProviderIcon provider={provider} className="tiv-ic" />
        <span className="tiv-st">{soon ? "เร็ว ๆ นี้" : "พร้อมใช้งาน"}</span>
        {!soon && <button type="button" className="tiv-star" aria-pressed={pinned} aria-label={`ปักหมุด ${provider.name}`} title={pinned ? "เลิกปักหมุด" : "ปักหมุด"} onClick={() => onPin(provider.key)}>{icon(Star)}</button>}
      </div>
      <div className="tiv-t-body">
        <h3>
          {soon ? provider.name : <Link href={href} onClick={() => onOpen(provider.key)}>{provider.name}</Link>}
          {(provider.currencies || []).map((currency) => <span key={currency} className="tiv-ccy">{currency}</span>)}
        </h3>
        <p>{provider.description}</p>
      </div>
      <div className="tiv-go"><span>{soon ? "ยังไม่เปิดให้ใช้งาน" : "เข้าใช้งาน"}</span>{!soon && <span className="ar">{icon(ArrowUpRight)}</span>}</div>
    </article>
  );
}

function StatsSheet({ stat, counts, errors, lang, onClose, onOpen }) {
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  const byProvider = counts.byProvider;
  const max = Math.max(1, ...Object.values(byProvider));
  const total = counts.total ?? 0;
  const failed = errors.map((error) => PROVIDER[error.provider]?.name || error.provider);
  return (
    <div className="tiv-sheet" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`tiv-sp ${stat.tone}`} role="dialog" aria-modal="true" aria-label={stat.label}>
        <div className="tiv-sp-h">
          <div><h2>{stat.label}</h2><p>{stat.description}</p></div>
          <button ref={closeRef} type="button" className="tiv-sp-x" aria-label="ปิด" onClick={onClose}>{icon(X)}</button>
        </div>
        <div className="tiv-sp-tot">{counts.total ?? "—"}<span>บัญชี</span></div>
        <p className="tiv-sp-note">
          {counts.total == null
            ? <>ยังไม่ได้ตั้งยอดเป้าหมายให้บัญชีไหน ตั้งได้ที่ <Link href={`${topupInventoryPath(lang)}/alerts`}>หน้าแจ้งเตือนสต็อก</Link></>
            : "ยอดล่าสุดที่บอทและระบบบันทึกไว้ · กดที่บริการเพื่อเข้าดูรายละเอียด"}
          {failed.length > 0 && <><br />อ่านยอดไม่สำเร็จ: {failed.join(", ")}</>}
        </p>
        {TOPUP_INVENTORY_GROUPS.filter((group) => group.key !== "tools").map((group) => {
          const items = TOPUP_INVENTORY_PROVIDERS.filter((provider) => provider.group === group.key && byProvider[provider.key] > 0)
            .sort((a, b) => byProvider[b.key] - byProvider[a.key]);
          if (!items.length) return null;
          return (
            <div key={group.key} className="tiv-sg">
              <div className="tiv-sg-h">{group.title}<span>{items.reduce((sum, provider) => sum + byProvider[provider.key], 0)} บัญชี</span></div>
              {items.map((provider) => {
                const value = byProvider[provider.key];
                return (
                  <Link key={provider.key} className="tiv-sr" data-hue={group.hue} href={`${topupInventoryPath(lang)}/${provider.key}`} onClick={() => onOpen(provider.key)}>
                    <ProviderIcon provider={provider} className="tiv-sic" />
                    <span className="tiv-sn">{provider.name}{(provider.currencies || []).map((currency) => <span key={currency} className="tiv-ccy" style={{ "--hue": `var(--${group.hue})` }}>{currency}</span>)}</span>
                    <span className="tiv-sv">{value}<small>{total ? Math.round((value / total) * 100) : 0}%</small></span>
                    <span className="tiv-mbar"><i style={{ width: `${Math.max(4, (value / max) * 100)}%` }} /></span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TopupInventoryHome({ lang }) {
  const router = useRouter();
  const { choice, setChoice } = useProjectmTheme();
  const searchRef = useRef(null);
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState("all");
  const [pins, setPins] = useState([]);
  const [recent, setRecent] = useState([]);
  const [intro, setIntro] = useState(true);
  // null while loading; { hidden } when this account may not read balances.
  const [snapshot, setSnapshot] = useState(null);
  const [openStat, setOpenStat] = useState(null);
  const base = topupInventoryPath(lang);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- browser storage is only readable after mount */
    setPins(readKeys(PINS_KEY));
    setRecent(readKeys(RECENT_KEY));
    /* eslint-enable react-hooks/set-state-in-effect */
    const timer = setTimeout(() => setIntro(false), 1400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/projectm/inventory-alerts", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) return { hidden: true };
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return { failed: body.error || "อ่านยอดบัญชีไม่สำเร็จ" };
        // Every source failing reads as no accounts at all; say it failed instead of showing zeros.
        if (!body.channels?.length && body.errors?.length) return { failed: "อ่านยอดบัญชีไม่สำเร็จ" };
        return { stats: topupInventoryStats(body.channels), errors: body.errors || [] };
      })
      .catch(() => ({ failed: "อ่านยอดบัญชีไม่สำเร็จ" }))
      .then((result) => { if (live) setSnapshot(result); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") { setOpenStat(null); return; }
      const tag = document.activeElement?.tagName;
      if (event.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const remember = (key) => {
    const next = [key, ...recent.filter((item) => item !== key)].slice(0, 3);
    setRecent(next);
    writeKeys(RECENT_KEY, next);
  };
  const togglePin = (key) => {
    const next = pins.includes(key) ? pins.filter((item) => item !== key) : [...pins, key];
    setPins(next);
    writeKeys(PINS_KEY, next);
  };
  const open = (key) => { remember(key); router.push(`${base}/${key}`); };

  const sections = useMemo(() => {
    const matching = (provider) => topupInventoryMatch(provider, query, currency);
    const pinned = pins.map((key) => PROVIDER[key]).filter((provider) => provider && matching(provider));
    return [
      ...(pinned.length ? [{ key: "pins", title: "ปักหมุดไว้", items: pinned }] : []),
      ...TOPUP_INVENTORY_GROUPS.map((group) => ({ ...group, items: TOPUP_INVENTORY_PROVIDERS.filter((provider) => provider.group === group.key && matching(provider)) }))
        .filter((group) => group.items.length),
    ];
  }, [pins, query, currency]);
  const nothingFound = !sections.some((section) => section.key !== "pins");
  let order = 0;

  const stats = snapshot?.stats;
  const statsNotice = snapshot?.failed || (snapshot?.errors?.length ? `อ่านยอดไม่ครบ ${snapshot.errors.length} บริการ` : null);
  const shownStat = TOPUP_INVENTORY_STATS.find((stat) => stat.key === openStat);

  return (
    <div className="tiv">
      <div className="tiv-aurora" aria-hidden><i /><i /><i /></div>
      <div className="tiv-shell">
        <header className="tiv-rail">
          <Link className="tiv-back" href="/">{icon(ChevronLeft)}กลับเมนูหลัก</Link>
          <div className="tiv-brand">ProjectM</div>
          <div className="tiv-seg" role="radiogroup" aria-label="ธีมสี">
            {THEMES.map(({ key, label, Icon }) => (
              <button key={key} type="button" role="radio" aria-checked={choice === key} aria-label={label} title={label} onClick={() => setChoice?.(key)}>{icon(Icon)}</button>
            ))}
          </div>
        </header>

        <main className={intro ? "tiv-intro" : undefined}>
          <section className="tiv-hero">
            <div className="tiv-hero-top">
              <div>
                <h1>Topup <em>Inventory</em></h1>
                <p className="tiv-sub">ศูนย์รวม Inventory สำหรับงานเติมเกม เลือกบริการที่ต้องการใช้งาน</p>
              </div>
              {!snapshot?.hidden && (
                <div className="tiv-stats-wrap">
                <div className="tiv-stats" aria-busy={!snapshot}>
                  {TOPUP_INVENTORY_STATS.map((stat) => {
                    const value = stats?.[stat.key].total;
                    return (
                      <button key={stat.key} type="button" className={`tiv-stat ${stat.tone}${snapshot ? "" : " loading"}`} aria-haspopup="dialog"
                        disabled={!stats} onClick={() => setOpenStat(stat.key)}>
                        <b>{value ?? "—"}<i>บัญชี</i></b><small>{stat.label}</small>
                      </button>
                    );
                  })}
                </div>
                {statsNotice && <p className="tiv-stats-note" role="status">{statsNotice}</p>}
                </div>
              )}
            </div>
            <div className="tiv-find">
              <label className="tiv-search">
                {icon(Search)}
                <input ref={searchRef} type="search" placeholder="ค้นหาบริการ หรือสกุลเงิน" autoComplete="off" aria-label="ค้นหาบริการ" value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") { setQuery(""); event.currentTarget.blur(); }
                    if (event.key === "Enter") {
                      const first = TOPUP_INVENTORY_PROVIDERS.find((provider) => provider.ready && topupInventoryMatch(provider, query, currency));
                      if (first) open(first.key);
                    }
                  }} />
                <kbd>/</kbd>
              </label>
              <div className="tiv-chips" role="group" aria-label="กรองตามสกุลเงิน">
                <button type="button" className="tiv-chip" aria-pressed={currency === "all"} onClick={() => setCurrency("all")}>ทั้งหมด <span className="n">{TOPUP_INVENTORY_PROVIDERS.length}</span></button>
                {TOPUP_INVENTORY_CURRENCIES.map((code) => (
                  <button key={code} type="button" className="tiv-chip" aria-pressed={currency === code} onClick={() => setCurrency(code)}>
                    {code} <span className="n">{TOPUP_INVENTORY_PROVIDERS.filter((provider) => (provider.currencies || []).includes(code)).length}</span>
                  </button>
                ))}
              </div>
              {recent.length > 0 && (
                <div className="tiv-recents"><span>เข้าล่าสุด</span>
                  {recent.map((key) => <Link key={key} href={`${base}/${key}`} onClick={() => remember(key)}>{PROVIDER[key].name}</Link>)}
                </div>
              )}
            </div>
          </section>

          <div className="tiv-groups" aria-label="บริการ Topup Inventory">
            {sections.map((section) => (
              <section key={section.key} className={`tiv-group${section.feature ? " feat" : ""}`} aria-labelledby={`tiv-g-${section.key}`}>
                <div className="tiv-group-h"><h2 id={`tiv-g-${section.key}`}>{section.title}</h2><span className="c">{section.items.length} บริการ</span><span className="bar" /></div>
                <div className="tiv-grid">
                  {section.items.map((provider) => (
                    <Tile key={provider.key} provider={provider} href={`${base}/${provider.key}`} hue={GROUP_OF[provider.group].hue} order={order++}
                      pinned={pins.includes(provider.key)} onPin={togglePin} onOpen={remember} />
                  ))}
                </div>
              </section>
            ))}
          </div>
          {nothingFound && <div className="tiv-empty"><strong>ไม่พบบริการที่ค้นหา</strong>ลองใช้คำอื่น หรือเลือกสกุลเงินเป็น &quot;ทั้งหมด&quot;</div>}
          <div className="tiv-note">{icon(CirclePlus)}<span>รองรับการเพิ่มบริการ Inventory อื่น ๆ ในอนาคต โดยแยกการจัดการของแต่ละบริการออกจากกัน</span></div>
        </main>
      </div>
      {shownStat && stats && (
        <StatsSheet stat={shownStat} counts={stats[shownStat.key]} errors={snapshot.errors} lang={lang} onClose={() => setOpenStat(null)} onOpen={remember} />
      )}
    </div>
  );
}
