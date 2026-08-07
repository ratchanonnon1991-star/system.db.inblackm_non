export default function GameinfoErrorNotice({ message }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-800">
      {message}
    </div>
  );
}
