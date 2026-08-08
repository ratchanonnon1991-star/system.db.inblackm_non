export default function GameinfoErrorNotice({ message }) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-300">
      {message}
    </div>
  );
}
