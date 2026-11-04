"use client";

import { useMemo, useState } from "react";
import { ArrowRight, TriangleAlert, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { gameinfoSheetCalcRate } from "@/lib/gameinfo-cost-profiles";
import { resolveGameinfoField } from "@/lib/gameinfo-formula-fields";
import { gameinfoListNumber, gameinfoMarginTone } from "@/lib/gameinfo-pack-list";

const METHODS = [
  { id: "sheet", label: "คิดแบบชีต" },
  { id: "direct", label: "กรอกเรทตรง" },
  { id: "variable", label: "ใช้ตัวแปร" },
];
const CARD_CURRENCIES = new Set(["USD", "EUR", "GBP", "JPY", "AUD", "CAD"]);
const PROBE = "__rate_probe__";
const TONE = { green: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300", amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300", red: "bg-red-500/15 text-red-800 dark:text-red-300" };

const toNumber = (value) => {
  const number = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(number) && number > 0 ? number : null;
};
const round = (value, digits = 6) => Number(Number(value).toFixed(digits));
const show = (value, digits = 6) => (value === null || value === undefined || !Number.isFinite(value) ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: digits }));
const baht = (value) => (value === null || !Number.isFinite(value) ? "—" : `฿${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

// "[Rate_MMK]" → { name: "Rate_MMK", invert: false }; "1/[Rate_MMK]" → invert.
function readVariableFormula(formula) {
  const text = String(formula || "").replace(/\s+/g, "");
  const plain = /^\[([^[\]]+)\]$/.exec(text);
  if (plain) return { name: plain[1], invert: false };
  const inverted = /^1\/\[([^[\]]+)\]$/.exec(text);
  return inverted ? { name: inverted[1], invert: true } : { name: "", invert: false };
}

/**
 * Changing one wallet's cost rate: worked out like the sheet (units per USDT,
 * or yuan per card unit, with live or typed USDT/THB), typed in, or taken
 * from a ตัวแปรผสม. Shows what each pack on the rate would cost and make, and
 * hands the changed profile back; the editor's save bar stores it.
 */
export default function GameinfoCostRateEditor({ row, packs, formulaVariables = [], externalValues = {}, otherProfiles = [], onApply, onClose }) {
  const profile = row.profile;
  const currency = row.currency || "หน่วย";
  const oldRate = Number.isFinite(Number(row.rate)) ? Number(row.rate) : null;
  const variableStart = readVariableFormula(profile.rateFormula);
  const [method, setMethod] = useState(row.method === "variable" ? "variable" : row.method === "sheet" ? "sheet" : "direct");
  const [kind, setKind] = useState(profile.sheetCalc?.kind || (CARD_CURRENCIES.has(String(row.currency).toUpperCase()) ? "cnyPerUnit" : "perUsdt"));
  const [amount, setAmount] = useState(profile.sheetCalc?.amount || "");
  const [usdtManual, setUsdtManual] = useState(Boolean(profile.sheetCalc?.usdtThb));
  const [usdtThb, setUsdtThb] = useState(profile.sheetCalc?.usdtThb || "");
  const [direct, setDirect] = useState(oldRate !== null ? String(round(oldRate)) : "");
  const [variableName, setVariableName] = useState(variableStart.name);
  const [invert, setInvert] = useState(variableStart.invert);
  const [note, setNote] = useState("");

  const variables = useMemo(
    () => formulaVariables.map((variable) => {
      const value = Number(resolveGameinfoField({}, {}, variable.name, { formulaVariables, externalValues }));
      return { name: variable.name, value: Number.isFinite(value) ? value : null };
    }),
    [externalValues, formulaVariables]
  );

  const sheetCalc = { kind, amount, usdtThb: usdtManual ? usdtThb : "" };
  const nextProfile = method === "sheet"
    ? (() => {
        const rate = gameinfoSheetCalcRate(sheetCalc, externalValues);
        return rate === null ? null : { ...profile, baseValue: String(round(rate)), rateFormula: "", sheetCalc: { ...sheetCalc, amount: String(toNumber(amount)), usdtThb: usdtManual ? String(toNumber(usdtThb)) : "" } };
      })()
    : method === "direct"
      ? (toNumber(direct) === null ? null : { ...profile, baseValue: String(toNumber(direct)), rateFormula: "", sheetCalc: undefined })
      : (variableName ? { ...profile, rateFormula: invert ? `1/[${variableName}]` : `[${variableName}]`, sheetCalc: undefined } : null);
  const newRate = nextProfile
    ? Number(resolveGameinfoField({ costProfileId: PROBE, amountChargedFee: "1" }, {}, "อัตราต้นทุน", {
        costProfiles: [{ ...nextProfile, id: PROBE }, ...otherProfiles],
        formulaVariables,
        externalValues,
      }))
    : null;
  const ready = nextProfile !== null && Number.isFinite(newRate) && newRate > 0;
  const changed = ready && (oldRate === null || Math.abs(newRate - oldRate) > 1e-9 || JSON.stringify(nextProfile) !== JSON.stringify(profile));

  const impact = packs.map((pack) => {
    const charged = gameinfoListNumber(pack.amountChargedFee);
    const price = gameinfoListNumber(pack.price);
    const oldCost = charged !== null && oldRate !== null ? charged * oldRate : null;
    const newCost = charged !== null && ready ? charged * newRate : null;
    const margin = (cost) => (price && cost !== null ? ((price - cost) / price) * 100 : null);
    return { id: pack.id, name: pack.name || "-", oldCost, newCost, oldMargin: margin(oldCost), newMargin: margin(newCost) };
  });

  function apply() {
    if (!ready) return;
    const cleaned = { ...nextProfile };
    if (!cleaned.sheetCalc) delete cleaned.sheetCalc;
    if (note.trim()) cleaned.note = note.trim().slice(0, 200);
    else delete cleaned.note;
    onApply(cleaned);
  }

  const field = "h-11 w-full rounded-xl border border-linear-hairline-strong bg-linear-surface-1 px-3 text-right text-[15px] font-bold tabular-nums text-linear-ink outline-none focus:border-[#D90005]";
  const seg = (on) => `h-10 flex-1 rounded-full text-sm font-bold transition ${on ? "bg-linear-surface-1 text-linear-ink shadow-sm" : "text-linear-ink-muted hover:text-linear-ink"}`;

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} className="max-h-[90vh] gap-0 overflow-hidden rounded-[22px] p-0 sm:max-w-[640px]">
        <div className="flex items-center gap-3 bg-gradient-to-br from-[#E3000B] to-[#A80004] px-5 py-4 text-white">
          <div className="min-w-0">
            <DialogTitle className="text-xl font-semibold text-white">แก้เรท · {row.channel}</DialogTitle>
            <DialogDescription className="text-[13px] text-white/90">
              ต่อ 1 {currency} · ใช้กับ {packs.length} แพ็ค · เรทตอนนี้ ฿{show(oldRate)}
            </DialogDescription>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-white">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex max-h-[calc(90vh-80px)] flex-col gap-4 overflow-y-auto px-5 py-4">
          <div role="group" aria-label="เรทนี้ได้มาจาก" className="flex gap-1 rounded-full bg-linear-surface-3 p-1">
            {METHODS.map((item) => (
              <button key={item.id} type="button" aria-pressed={method === item.id} onClick={() => setMethod(item.id)} className={seg(method === item.id)}>
                {item.label}
              </button>
            ))}
          </div>

          {method === "sheet" ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-linear-hairline bg-linear-surface-2 p-4">
              <div role="group" aria-label="แบบที่ชีตคิด" className="flex flex-wrap gap-2 text-[13px]">
                <button type="button" aria-pressed={kind === "perUsdt"} onClick={() => setKind("perUsdt")} className={`rounded-full border px-3 py-1.5 font-bold ${kind === "perUsdt" ? "border-[#D90005] bg-[#D90005]/10 text-[#A80004] dark:text-red-300" : "border-linear-hairline-strong text-linear-ink-muted"}`}>
                  ซื้อ {currency} ด้วย USDT
                </button>
                <button type="button" aria-pressed={kind === "cnyPerUnit"} onClick={() => setKind("cnyPerUnit")} className={`rounded-full border px-3 py-1.5 font-bold ${kind === "cnyPerUnit" ? "border-[#D90005] bg-[#D90005]/10 text-[#A80004] dark:text-red-300" : "border-linear-hairline-strong text-linear-ink-muted"}`}>
                  ซื้อบัตร {currency} ด้วยหยวน
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-[13px] font-medium text-linear-ink">
                  {kind === "perUsdt" ? `${currency} ที่ได้ต่อ 1 USDT` : `ราคา ¥ ต่อ 1 ${currency}`}
                  <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={kind === "perUsdt" ? "เช่น 4615" : "เช่น 5.85"} className={field} />
                </label>
                <div className="flex flex-col gap-1.5 text-[13px] font-medium text-linear-ink">
                  บาทต่อ 1 USDT
                  <div className="flex gap-2">
                    <button type="button" aria-pressed={!usdtManual} onClick={() => setUsdtManual(false)} className={`h-11 flex-1 rounded-xl border text-sm font-bold ${!usdtManual ? "border-[#D90005] bg-[#D90005]/10 text-linear-ink" : "border-linear-hairline-strong text-linear-ink-muted"}`}>
                      เรทสด {show(Number(externalValues["USDT/THB"]), 2)}
                    </button>
                    {usdtManual ? (
                      <input aria-label="บาทต่อ 1 USDT ที่กรอกเอง" inputMode="decimal" autoFocus value={usdtThb} onChange={(event) => setUsdtThb(event.target.value)} placeholder="เช่น 32.57" className={`${field} flex-1`} />
                    ) : (
                      <button type="button" onClick={() => setUsdtManual(true)} className="h-11 flex-1 rounded-xl border border-linear-hairline-strong text-sm text-linear-ink-muted hover:text-linear-ink">กรอกเอง</button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-linear-hairline-strong bg-linear-surface-1 px-3.5 py-2.5">
                <span className="font-mono text-xs text-linear-ink-muted">
                  {kind === "perUsdt" ? `USDT/THB ÷ ${amount || "?"}` : `¥${amount || "?"} ÷ USDCNY ${show(Number(externalValues.USDCNY), 4)} × USDT/THB`}
                </span>
                <span className="text-xl font-black tabular-nums text-[#C20004] dark:text-red-300">฿{show(ready ? newRate : null)}</span>
              </div>
              <p className="text-xs text-linear-ink-tertiary">บันทึกแล้วเรทนี้คงที่ ระบบคิดเรทแนะนำใหม่ทุกชั่วโมงในตาราง แต่เปลี่ยนเรทก็ต่อเมื่อแอดมินกด “ใช้เรทนี้”</p>
            </div>
          ) : null}

          {method === "direct" ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-linear-hairline bg-linear-surface-2 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-[13px] font-medium text-linear-ink">
                  บาท ต่อ 1 {currency}
                  <input inputMode="decimal" value={direct} onChange={(event) => setDirect(event.target.value)} className={field} />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] font-medium text-linear-ink">
                  หรือ {currency} ต่อ 1 บาท
                  <input
                    inputMode="decimal"
                    value={toNumber(direct) ? String(round(1 / toNumber(direct), 4)) : ""}
                    onChange={(event) => { const value = toNumber(event.target.value); setDirect(value ? String(round(1 / value)) : ""); }}
                    className={field}
                  />
                </label>
              </div>
              <p className="text-xs text-linear-ink-tertiary">กรอกช่องไหนก็ได้ อีกช่องคำนวณให้ เรทนี้คงที่จนกว่าจะมีคนแก้</p>
            </div>
          ) : null}

          {method === "variable" ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-linear-hairline bg-linear-surface-2 p-4">
              <p className="text-[13px] text-linear-ink-muted">อ้างตัวแปรผสม แก้ค่าตัวแปรครั้งเดียว ทุกช่องทางที่ใช้ตัวแปรนี้เปลี่ยนตาม (แก้ค่าได้ที่ “ตัวแปรผสม”)</p>
              {variables.length ? variables.map((variable) => (
                <label key={variable.name} className={`flex items-center gap-3 rounded-xl border bg-linear-surface-1 px-3 py-2.5 ${variableName === variable.name ? "border-[#D90005]" : "border-linear-hairline"}`}>
                  <input type="radio" name="cost-rate-variable" checked={variableName === variable.name} onChange={() => setVariableName(variable.name)} className="h-5 w-5 accent-[#D90005]" />
                  <span className="font-mono text-sm font-bold text-linear-ink">{variable.name}</span>
                  <span className="ml-auto tabular-nums text-sm text-linear-ink">{show(variable.value)}</span>
                </label>
              )) : <p className="text-sm text-linear-ink-tertiary">เกมนี้ยังไม่มีตัวแปรผสม</p>}
              <label className="mt-1 flex items-center gap-2 text-[13px] text-linear-ink">
                <input type="checkbox" checked={invert} onChange={(event) => setInvert(event.target.checked)} className="h-5 w-5 accent-[#D90005]" />
                ตัวแปรเก็บเป็น {currency} ต่อ 1 บาท (ใช้ 1 ÷ ค่า เช่น 141.69 MMK = ฿1)
              </label>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-bold text-linear-ink">ผลกับแพ็ค {impact.length} แพ็ค</span>
              <span className="text-xs text-linear-ink-tertiary">กำไรเทียบราคาขาย</span>
            </div>
            {impact.length ? (
              <div className="overflow-hidden rounded-2xl border border-linear-hairline">
                <table className="w-full text-[13px]">
                  <thead className="bg-linear-surface-2 text-xs text-linear-ink-tertiary">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">แพ็ค</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">ต้นทุนเดิม</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">ต้นทุนใหม่</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">กำไร %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impact.map((item) => (
                      <tr key={item.id} className="border-t border-linear-hairline tabular-nums">
                        <td className="px-3 py-2 font-medium text-linear-ink">{item.name}</td>
                        <td className="px-3 py-2 text-right text-linear-ink-muted">{baht(item.oldCost)}</td>
                        <td className="px-3 py-2 text-right font-bold text-linear-ink">{baht(item.newCost)}</td>
                        <td className="px-3 py-2">
                          <span className="flex items-center justify-end gap-1.5">
                            <span className="text-linear-ink-muted">{item.oldMargin === null ? "—" : `${item.oldMargin.toFixed(1)}%`}</span>
                            <ArrowRight size={12} aria-hidden="true" className="text-linear-ink-tertiary" />
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TONE[gameinfoMarginTone(item.newMargin)] || "text-linear-ink-muted"}`}>{item.newMargin === null ? "—" : `${item.newMargin.toFixed(1)}%`}</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-linear-ink-tertiary">ไม่มีแพ็คในโหมดนี้ที่ใช้เรทนี้</p>}
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-[13px] text-amber-900 dark:text-amber-200">
            <TriangleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>หลังบันทึก ต้นทุนและกำไรของแพ็คเหล่านี้เปลี่ยนทันที ช่องทางขายที่ตรวจราคาไว้แล้วจะกลับเป็น “รอตรวจ” ให้ตรวจใหม่</span>
          </div>

          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-linear-ink">
            เหตุผลที่แก้ (เก็บในประวัติ ไม่บังคับ)
            <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder="เช่น อัปเดตเรท USDT ตามตลาด" className="h-11 rounded-xl border border-linear-hairline-strong bg-linear-surface-1 px-3 text-sm text-linear-ink outline-none focus:border-[#D90005]" />
          </label>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-linear-hairline pt-3">
            <span className="mr-auto text-xs text-linear-ink-tertiary">ใช้แล้วกด “บันทึก” ที่แถบด้านล่างเพื่อบันทึกจริง</span>
            <button type="button" onClick={onClose} className="h-11 rounded-full border border-linear-hairline-strong px-5 text-sm text-linear-ink hover:bg-linear-surface-2">ยกเลิก</button>
            <button type="button" disabled={!changed} onClick={apply} className="h-11 rounded-full bg-[#D90005] px-6 text-sm font-bold text-white hover:bg-[#B80004] disabled:opacity-40">ใช้เรทนี้</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
