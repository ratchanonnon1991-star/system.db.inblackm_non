import GameinfoImagePreview from "./gameinfo-image-preview";
import { evaluateFormula, parseFormula } from "@/lib/gamedb-formula";
import { formatCell } from "@/lib/gamedb-layout";
import { resolveGameinfoField } from "@/lib/gameinfo-formula-fields";

// A formula saved with a typo or a since-removed field should not take the
// whole detail page down — it just renders as a dash for that column.
function parseComputedColumns(columns) {
  return (columns || []).map((col) => {
    try {
      return { ...col, ast: parseFormula(col.formula) };
    } catch {
      return { ...col, ast: null };
    }
  });
}

// Full read-only view of a gameinfo game: header + one table per pack
// category, grouped by currency. Ported from gameinfo's GameFullView.
export default function GameinfoGameView({ game }) {
  const showCountryCol = game.vpn === "YES";
  const computedColumns = parseComputedColumns(game.computedColumns);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
          {game.image ? (
            <GameinfoImagePreview src={game.image} alt={game.gameName}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={game.image}
                alt={game.gameName}
                className="h-24 w-24 object-cover"
              />
            </GameinfoImagePreview>
          ) : (
            <span className="text-4xl">🎮</span>
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">{game.gameName}</h1>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
            {game.region && <span>Region: {game.region}</span>}
            {game.platform && <span>Platform: {game.platform}</span>}
            {game.server && <span>Server: {game.server}</span>}
            <span>
              VPN:{" "}
              {game.vpn === "YES" ? (
                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700">
                  YES
                </span>
              ) : (
                "NO"
              )}
            </span>
          </div>
          {game.webTopup && (
            <a
              href={game.webTopup}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
            >
              ไปที่เว็บเติมเกม ↗
            </a>
          )}
        </div>
      </div>

      {game.currencies.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
          ยังไม่มีข้อมูลแพ็กสำหรับเกมนี้
        </p>
      ) : (
        <div className="space-y-8">
          {game.currencies.map((currency) => (
            <section key={currency.id}>
              <div className="mb-3 flex items-center gap-2">
                {currency.image && (
                  <GameinfoImagePreview src={currency.image} alt={currency.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currency.image}
                      alt={currency.name}
                      className="h-7 w-7 rounded object-cover"
                    />
                  </GameinfoImagePreview>
                )}
                <h2 className="text-lg font-semibold text-slate-800">
                  <span className="text-slate-400">สกุลเงิน: </span>
                  {currency.name || "-"}
                </h2>
              </div>

              <div className="space-y-5">
                {currency.categories.map((cat) => (
                  <div key={cat.id}>
                    {cat.name && (
                      <h3 className="mb-2 text-sm font-medium text-slate-600">
                        {cat.name}
                      </h3>
                    )}
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <div className="min-w-[900px]">
                        <div
                          className={`grid ${packViewGridCols(
                            showCountryCol,
                            computedColumns.length
                          )} gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-500`}
                        >
                          <span>Pack</span>
                          <span>ราคา</span>
                          <span>ยอดที่กด</span>
                          <span>ยอดที่กด + fee</span>
                          <span>ช่องทางหลัก</span>
                          <span>ช่องทางรอง</span>
                          {showCountryCol && <span>ประเทศ</span>}
                          {computedColumns.map((col) => (
                            <span key={col.key} className="truncate text-indigo-500">
                              {col.label}
                            </span>
                          ))}
                        </div>
                        {cat.packs.map((pack, pIdx) => (
                          <div
                            key={pack.id}
                            className={`grid ${packViewGridCols(
                              showCountryCol,
                              computedColumns.length
                            )} items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0`}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0 text-xs text-slate-400">
                                {pIdx + 1}.
                              </span>
                              {pack.image && (
                                <GameinfoImagePreview src={pack.image} alt={pack.name}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={pack.image}
                                    alt={pack.name}
                                    className="h-6 w-6 shrink-0 rounded object-cover"
                                  />
                                </GameinfoImagePreview>
                              )}
                              <span className="truncate font-medium text-slate-700">
                                {pack.name || "-"}
                              </span>
                            </div>
                            <span className="truncate text-slate-600">
                              {pack.price || "-"}
                            </span>
                            <span className="truncate text-slate-600">
                              {pack.amountCharged || "-"}
                            </span>
                            <span className="truncate text-slate-600">
                              {pack.amountChargedFee || "-"}
                            </span>
                            <span className="truncate text-slate-600">
                              {(pack.channelsMain || []).join(", ") || "-"}
                            </span>
                            <span className="truncate text-slate-600">
                              {(pack.channelsSecondary || []).join(", ") || "-"}
                            </span>
                            {showCountryCol && (
                              <span className="truncate text-slate-600">
                                {pack.country || "-"}
                              </span>
                            )}
                            {computedColumns.map((col) => {
                              const value = col.ast
                                ? evaluateFormula(col.ast, (label) =>
                                    resolveGameinfoField(pack, game, label)
                                  )
                                : null;
                              return (
                                <span key={col.key} className="truncate text-slate-600">
                                  {formatCell(value, col.type)}
                                </span>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// Fixed grid columns so every pack table (every category/currency) lines up.
// One extra 120px track per computed column, appended after the fixed ones.
function packViewGridCols(showCountryCol, computedCount = 0) {
  const base = showCountryCol
    ? "minmax(200px,1fr)_90px_110px_110px_160px_160px_140px"
    : "minmax(200px,1fr)_90px_110px_110px_160px_160px";
  const extra = Array.from({ length: computedCount }, () => "120px").join("_");
  return `grid-cols-[${extra ? `${base}_${extra}` : base}]`;
}
