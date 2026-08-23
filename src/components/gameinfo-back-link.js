"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { confirmGameinfoNavigation } from "@/lib/gameinfo-unsaved-changes";

export default function GameinfoBackLink({ className, href }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (!confirmGameinfoNavigation()) return;
        router.replace(href);
      }}
      className={className}
    >
      <ArrowLeft size={14} /> ย้อนกลับ
    </button>
  );
}
