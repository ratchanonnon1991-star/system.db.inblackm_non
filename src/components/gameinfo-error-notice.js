export default function GameinfoErrorNotice({ message }) {
  return (
    <div className="rounded-lg border border-linear-warning/40 bg-linear-warning-bg p-6 text-sm font-medium text-linear-warning">
      {message}
    </div>
  );
}
