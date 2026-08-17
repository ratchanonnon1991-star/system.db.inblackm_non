"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function GameinfoDatasetToggle({ basePath }) {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "idpass" ? "idpass" : "uid";
  function href(nextMode) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === "idpass") params.set("mode", "idpass");
    else params.delete("mode");
    const query = params.toString();
    return `${basePath}${query ? `?${query}` : ""}`;
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
