"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { gameinfoModeQuery } from "@/lib/gameinfo-data-mode";

export default function GameinfoDatasetToggle({ basePath }) {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "idpass" ? "idpass" : "uid";
  function href(nextMode) {
    return `${basePath}${gameinfoModeQuery(nextMode)}`;
  }
  return (
    <div className="inline-flex rounded-lg border border-linear-hairline-strong bg-linear-surface-1 p-1 text-xs">
      {[['uid', 'UID'], ['idpass', 'IDPASS']].map(([value, label]) => (
        <Link
          key={value}
          href={href(value)}
          prefetch={false}
          className={`rounded-md px-3 py-1.5 font-medium ${mode === value ? "bg-linear-primary text-white" : "text-linear-ink-muted hover:bg-linear-surface-2"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
