"use client";

import { ArrowLeft } from "lucide-react";
import { requestGameinfoBack } from "@/lib/gameinfo-unsaved-changes";

export default function GameinfoBackLink({ className, href }) {
  return (
    <button
      type="button"
      onClick={() => requestGameinfoBack(href)}
      className={className}
    >
      <ArrowLeft size={14} /> ย้อนกลับ
    </button>
  );
}
