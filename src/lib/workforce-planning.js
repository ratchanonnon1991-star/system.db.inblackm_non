export const TIME_ZONE = "Asia/Bangkok";
export const SHIFT_TYPES = [
  { id: "fullTime", label: "Full time" }, { id: "intern", label: "Intern" }, { id: "partTime", label: "Part time" },
];
export const SHIFTS = [
  ...["fullTime", "intern"].flatMap(type => [
    { id: `${type}-day`, type, start: 9, end: 18, label: "09:00–18:00" },
    { id: `${type}-evening`, type, start: 18, end: 27, label: "18:00–03:00 (+1)" },
    { id: `${type}-night`, type, start: 27, end: 33, label: "03:00–09:00 (+1)" },
  ]),
  { id: "partTime-noon", type: "partTime", start: 12, end: 18, label: "12:00–18:00" },
  { id: "partTime-evening", type: "partTime", start: 18, end: 24, label: "18:00–00:00 (+1)" },
  { id: "partTime-late", type: "partTime", start: 21, end: 27, label: "21:00–03:00 (+1)" },
  { id: "partTime-night", type: "partTime", start: 24, end: 30, label: "00:00–06:00 (+1)" },
];

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value;
}
export function addDays(date, days) {
  if (!validDate(date)) throw new Error("Invalid planning date");
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
export function bangkokDate(now = new Date()) {
  return new Date(+now + 7 * 3600000).toISOString().slice(0, 10);
}
export function bangkokWorkday(now = new Date()) {
  const shifted = new Date(+now + 7 * 3600000);
  const date = bangkokDate(now);
  return shifted.getUTCHours() < 9 ? addDays(date, -1) : date;
}
export function hourAt(date, offset) {
  return new Date(Date.parse(`${date}T00:00:00+07:00`) + offset * 3600000);
}
export function hourKey(date) {
  return new Date(+new Date(date) + 7 * 3600000).toISOString().slice(0, 13);
}

export function defaultStaffPlan() {
  return { rates: { fullTime: 0, intern: 0, partTime: 0 }, counts: Object.fromEntries(SHIFTS.map(s => [s.id, 0])), utilization: 80, humanShare: 100 };
}
export function normalizeStaffPlan(raw) {
  const number = (value, max) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Number(value))) : 0;
  return {
    rates: Object.fromEntries(SHIFT_TYPES.map(t => [t.id, number(raw?.rates?.[t.id], 1000)])),
    counts: Object.fromEntries(SHIFTS.map(s => [s.id, Math.floor(number(raw?.counts?.[s.id], 1000))])),
    utilization: Math.max(1, number(raw?.utilization ?? 80, 100)),
    humanShare: number(raw?.humanShare ?? 100, 100),
  };
}

// A weekday/hour seasonal baseline. Empty observed days count as zero, but
// days preceding source coverage do not. No incomplete day or future data is
// admitted into training. The interval is an empirical prediction band, NOT
// a promise or a statistically calibrated confidence interval.
export function forecastHours(buckets, { date, historyStart, coverageStart, days = 56 }) {
  const start = Math.max(Date.parse(`${historyStart}T09:00:00+07:00`), coverageStart ? +new Date(coverageStart) : 0);
  const cutoff = +hourAt(date, 9);
  const units = new Map();
  for (const row of buckets) {
    const at = +new Date(row.hour);
    if (at < start || at >= cutoff) continue;
    units.set(hourKey(row.hour), (units.get(hourKey(row.hour)) || 0) + Number(row.units || 0));
  }
  const targetDate = addDays(date, 1);
  return Array.from({ length: 24 }, (_, index) => {
    const target = hourAt(targetDate, index + 9);
    const samples = [];
    const all = [];
    for (let offset = 1; offset <= days; offset++) {
      const sampleDay = addDays(date, -offset);
      const at = hourAt(sampleDay, index + 9);
      // Exclude the first partial coverage day, not merely individual hours.
      if (+hourAt(sampleDay, 9) < start || +at >= cutoff) continue;
      const value = units.get(hourKey(at)) || 0;
      all.push(value);
      if (at.getUTCDay() === target.getUTCDay()) samples.push(value);
    }
    const selected = samples.length >= 3 ? samples : all.slice(0, 14);
    if (selected.length < 3) return { hour: target.toISOString(), expected: null, low: null, high: null, samples: selected.length, method: "insufficient" };
    const mean = selected.reduce((a, b) => a + b, 0) / selected.length;
    const variance = selected.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, selected.length - 1);
    const margin = Math.max(1, 1.28 * Math.sqrt(variance));
    return { hour: target.toISOString(), expected: Math.round(mean * 10) / 10,
      low: Math.max(0, Math.floor(mean - margin)), high: Math.ceil(mean + margin),
      samples: selected.length, method: samples.length >= 3 ? "weekday-hour" : "recent-hour" };
  });
}

export function calculateStaffing(forecast, rawPlan) {
  const plan = normalizeStaffPlan(rawPlan);
  const factor = plan.utilization / 100;
  const shiftRows = SHIFTS.map(shift => {
    const hours = forecast.slice(shift.start - 9, shift.end - 9);
    const known = hours.length === shift.end - shift.start && hours.every(h => h.expected != null);
    const total = known ? hours.reduce((n, h) => n + h.expected, 0) : null;
    const peak = known ? Math.max(...hours.map(h => h.expected * plan.humanShare / 100)) : null;
    const rate = plan.rates[shift.type];
    return { ...shift, hours: hours.length, units: total, averagePerHour: total == null ? null : total / hours.length,
      peakPerHour: peak, count: plan.counts[shift.id], rate,
      standalonePeople: peak == null || rate <= 0 ? null : Math.ceil(peak / (rate * factor)),
      capacity: plan.counts[shift.id] * rate * factor * hours.length };
  });
  const hours = forecast.map((row, index) => {
    const active = SHIFTS.filter(s => index + 9 >= s.start && index + 9 < s.end);
    const capacity = active.reduce((n, s) => n + plan.counts[s.id] * plan.rates[s.type] * factor, 0);
    const demand = row.expected == null ? null : row.expected * plan.humanShare / 100;
    return { ...row, capacity, demand, gap: demand == null ? null : Math.max(0, demand - capacity),
      people: active.reduce((n, s) => n + plan.counts[s.id], 0) };
  });
  return { plan, shifts: shiftRows, hours };
}
