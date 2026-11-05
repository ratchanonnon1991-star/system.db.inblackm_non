// Shown inside the GameInfo header while a page under it renders. Without it
// a click from the hub left the hub on screen, apparently doing nothing, until
// the whole game list had arrived.
export default function GameinfoLoading() {
  return (
    <div role="status" className="flex flex-1 items-center justify-center gap-3 py-24 text-sm text-linear-ink-muted">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-linear-hairline-strong border-t-linear-primary"
      />
      กำลังโหลด…
    </div>
  );
}
