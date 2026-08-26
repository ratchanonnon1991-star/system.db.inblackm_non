"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";

export default function GameinfoBotEditLink({ href, channelName }) {
  return (
    <Link
      href={href}
      onClick={(event) => event.stopPropagation()}
      aria-label={`แก้ไข ${channelName}`}
      className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-linear-hairline-strong px-2 text-xs font-medium text-linear-ink-muted hover:bg-linear-surface-3 hover:text-linear-ink"
    >
      <Pencil size={13} /> แก้ไข
    </Link>
  );
}
