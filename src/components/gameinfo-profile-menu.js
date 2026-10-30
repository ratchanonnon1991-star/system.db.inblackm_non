"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { apiJson } from "@/lib/api-json";

// The avatar at the right of the GameInfo header: opens a small menu with who
// is signed in and a sign-out, which goes back to the hub's login screen.
export default function GameinfoProfileMenu({ name, role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef(null);
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function logout() {
    setLeaving(true);
    try {
      await apiJson("/api/auth/logout", { method: "POST" });
    } catch {
      // the cookie clear is best-effort; the hub shows the login screen either way
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`บัญชี ${name}`}
        title={name}
        className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-2 border-white bg-[#18181B] text-[15px] font-black text-white transition hover:ring-2 hover:ring-white/60"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[50px] z-50 w-60 overflow-hidden rounded-xl border border-linear-hairline bg-linear-surface-1 text-linear-ink shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
        >
          <div className="border-b border-linear-hairline px-4 py-3">
            <p className="truncate text-[14px] font-extrabold" title={name}>{name}</p>
            {role && <p className="mt-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-linear-ink-muted">{role}</p>}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            disabled={leaving}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] font-bold text-[#D90005] transition hover:bg-linear-surface-3 disabled:opacity-60"
          >
            <LogOut size={16} strokeWidth={2.2} aria-hidden="true" />
            {leaving ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
          </button>
        </div>
      )}
    </div>
  );
}
