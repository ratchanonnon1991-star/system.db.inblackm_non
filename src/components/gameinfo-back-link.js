"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

// "ย้อนกลับ" — goes to whatever page was open before this one via browser
// history (router.back()), not a hardcoded forward link to the game detail
// page. Used where the packs page itself is a Server Component and can't
// call router.back() directly (see [id]/packs/page.js); gameinfo-pack-editor.js
// is already a Client Component and calls router.back() inline instead.
export default function GameinfoBackLink({ className }) {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.back()} className={className}>
      <ArrowLeft size={14} /> ย้อนกลับ
    </button>
  );
}
