"use client";

import { useEffect, useState } from "react";

// The manage page is one long form in numbered cards; the nav beside it jumps
// between them and marks the one being read. `number` is optional so the same
// cards also work on pages without the nav (the standalone packs page).
export function GameinfoManageSection({ id, number, title, description, actions, className = "", children }) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={`scroll-mt-40 rounded-2xl border border-linear-hairline bg-linear-surface-1 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] sm:p-6 ${className}`}
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-xl font-black text-linear-ink">
            {number ? `${number}. ` : ""}{title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-linear-ink-tertiary">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function GameinfoManageNav({ sections }) {
  const [activeId, setActiveId] = useState(sections[0]?.id);

  useEffect(() => {
    const nodes = sections.map((section) => document.getElementById(section.id)).filter(Boolean);
    if (!nodes.length || typeof IntersectionObserver === "undefined") return undefined;
    // The band just under the sticky bars: whichever card crosses it is the
    // one being read.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-160px 0px -60% 0px" }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="ส่วนของฟอร์ม"
      className="flex gap-1 overflow-x-auto rounded-[14px] border border-linear-hairline bg-linear-surface-1 p-2 lg:sticky lg:top-[152px] lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible"
    >
      {sections.map((section, index) => {
        const active = section.id === activeId;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={active ? "location" : undefined}
            onClick={() => setActiveId(section.id)}
            className={`flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[10px] px-3 text-sm font-bold transition ${active ? "bg-[#D90005]/10 text-[#B80004] dark:text-[#FF8A8C]" : "text-linear-ink-muted hover:bg-linear-surface-2 hover:text-linear-ink"}`}
          >
            <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-black ${active ? "bg-[#D90005] text-white" : "bg-[#18181B] text-white dark:bg-white dark:text-[#18181B]"}`}>
              {index + 1}
            </span>
            {section.label}
          </a>
        );
      })}
    </nav>
  );
}
