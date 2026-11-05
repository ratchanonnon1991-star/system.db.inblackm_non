import { ChevronDown } from "lucide-react";

/**
 * A GameInfo dropdown with room around its arrow. The browser's own arrow
 * sits on the border right against the text, so every filter select in
 * GameInfo uses this instead of a bare <select>.
 */
export default function GameinfoSelect({ children, className = "", wrapperClassName = "", ...props }) {
  return (
    <span className={`relative inline-flex ${wrapperClassName}`}>
      <select
        {...props}
        className={`h-10 w-full appearance-none rounded-xl border border-linear-hairline-strong bg-linear-surface-1 pl-3.5 pr-10 text-sm text-linear-ink outline-none focus:border-[#D90005] ${className}`}
      >
        {children}
      </select>
      <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-linear-ink-muted" />
    </span>
  );
}
