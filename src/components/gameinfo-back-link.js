"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { confirmGameinfoNavigation } from "@/lib/gameinfo-unsaved-changes";

// "ย้อนกลับ" — goes to whatever page was open before this one via browser
// history (router.back()), not a hardcoded forward link to the game detail
// page. Used where the packs page itself is a Server Component and can't
// call router.back() directly (see [id]/packs/page.js); gameinfo-pack-editor.js
// is already a Client Component and calls router.back() inline instead
// (same window.history.length guard, see its own back button).
//
// `fallbackHref` covers opening the page directly (new tab, bookmark,
// shared link) — there's nothing in this tab's history to go back to, and
// router.back() would otherwise silently do nothing.
export default function GameinfoBackLink({ className, fallbackHref }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (!confirmGameinfoNavigation()) return;
        if (fallbackHref && window.history.length <= 1) router.push(fallbackHref);
        else router.back();
      }}
      className={className}
    >
      <ArrowLeft size={14} /> ย้อนกลับ
    </button>
  );
}
