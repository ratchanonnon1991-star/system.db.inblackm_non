import { addDays, bangkokWorkday, forecastHours, hourAt, hourKey, validDate } from "../lib/workforce-planning.js";

export const CHANNELS = { web: "เว็บ InblackM", russia: "Russia", inblackm_reseller: "InblackM Reseller",
  page: "PAGE", kaleoz: "Kaleoz", itemku: "Itemku", playerok: "PlayerOK", g2g: "G2G", telegram_other: "Telegram / ไม่ทราบช่องทาง" };

export function planningRange(date, now = new Date()) {
  const today = bangkokWorkday(now);
  if (!validDate(date) || date > today || date < addDays(today, -90)) {
    throw Object.assign(new Error("เลือกวันที่จริงในช่วงย้อนหลังไม่เกิน 90 วัน"), { status: 400 });
  }
  return { from: hourAt(addDays(date, -56), 9).toISOString(), to: new Date(Math.min(+hourAt(date, 33), +now)).toISOString() };
}

export function buildWorkforceReport(data, { date, now = new Date(), channel = "all" }) {
  if (channel !== "all" && !Object.hasOwn(CHANNELS, channel)) throw Object.assign(new Error("ช่องทางไม่ถูกต้อง"), { status: 400 });
  const buckets = data.buckets.filter(b => channel === "all" || b.channel === channel);
  const start = +hourAt(date, 9), end = +hourAt(date, 33);
  const actual = Array.from({ length: 24 }, (_, i) => {
    const hour = hourAt(date, i + 9).toISOString();
    const rows = buckets.filter(b => hourKey(b.hour) === hourKey(hour));
    const available = +new Date(hour) <= +now;
    return { hour, orders: available ? rows.reduce((n, r) => n + Number(r.orders), 0) : null,
      units: available ? rows.reduce((n, r) => n + Number(r.units), 0) : null };
  });
  const byChannel = Object.entries(CHANNELS).filter(([id]) => channel === "all" || channel === id).map(([id, label]) => {
    const rows = buckets.filter(b => b.channel === id);
    const history = rows.filter(b => +new Date(b.hour) < start && Number(b.units) > 0);
    const observed = rows.filter(b => +new Date(b.hour) >= start && +new Date(b.hour) < end);
    const coverageStart = rows.length ? rows.reduce((a, b) => +new Date(a.hour) < +new Date(b.hour) ? a : b).hour : null;
    const forecast = history.length ? forecastHours(rows, { date, historyStart: addDays(date, -56), coverageStart }) : null;
    const predicted = forecast?.every(h => h.expected != null) ? forecast.reduce((n, h) => n + h.expected, 0) : null;
    return { id, label, orders: observed.reduce((n, r) => n + Number(r.orders), 0),
      units: observed.reduce((n, r) => n + Number(r.units), 0),
      openOrders: rows.reduce((n, r) => n + Number(r.open_orders), 0),
      openUnits: rows.reduce((n, r) => n + Number(r.open_units), 0),
      unknownStatus: rows.reduce((n, r) => n + Number(r.unknown_status), 0),
      cancelled: rows.reduce((n, r) => n + Number(r.cancelled), 0),
      coverageStart, predicted, forecast, hasHistory: history.length > 0 };
  });
  const trained = byChannel.filter(c => c.hasHistory);
  const forecast = Array.from({ length: 24 }, (_, i) => {
    const values = trained.map(c => c.forecast[i]);
    const known = values.length > 0 && values.every(v => v.expected != null);
    return { hour: hourAt(addDays(date, 1), i + 9).toISOString(),
      expected: known ? values.reduce((n, v) => n + v.expected, 0) : null,
      low: known ? values.reduce((n, v) => n + v.low, 0) : null,
      high: known ? values.reduce((n, v) => n + v.high, 0) : null,
      samples: values.length ? Math.min(...values.map(v => v.samples)) : 0,
      method: known ? values.every(v => v.method === "weekday-hour") ? "weekday-hour" : "recent-hour" : "insufficient" };
  });
  const units = actual.reduce((n, r) => n + (r.units || 0), 0);
  const orders = actual.reduce((n, r) => n + (r.orders || 0), 0);
  const elapsedHours = Math.max(0, Math.min(24, (+now - start) / 3600000));
  const warnings = [...data.warnings];
  if (byChannel.some(c => c.coverageStart && !c.hasHistory)) warnings.push("บางช่องทางยังไม่มีวันย้อนหลังครบ จึงยังไม่รวมในการพยากรณ์");
  if (trained.some(c => c.predicted == null)) warnings.push("ข้อมูลย้อนหลังบางช่องทางไม่พอ คาดการณ์และจำนวนคนจะแสดง — แทนการเดา");
  if (byChannel.some(c => c.unknownStatus)) warnings.push("บางต้นทางไม่มีสถานะปิดงานที่ยืนยันได้: คงค้างอาจรวมงานที่เสร็จแล้ว ต้องตรวจต้นทาง");
  return { date, forecastDate: addDays(date, 1), timezone: "Asia/Bangkok", workday: "09:00–09:00 วันถัดไป",
    historyStart: addDays(date, -56), fetchedAt: data.fetchedAt, sources: data.sources, warnings,
    summary: { orders, units,
      averagePerHour: elapsedHours ? units / elapsedHours : null,
      peakPerHour: Math.max(0, ...actual.map(r => r.units || 0)),
      ordersPerHour: elapsedHours ? orders / elapsedHours : null,
      peakOrdersPerHour: Math.max(0, ...actual.map(r => r.orders || 0)),
      openUnits: byChannel.reduce((n, c) => n + c.openUnits, 0),
      expectedUnits: forecast.every(h => h.expected != null) ? forecast.reduce((n, h) => n + h.expected, 0) : null },
    channels: byChannel.map(({ forecast: _forecast, ...c }) => c), actual, forecast };
}
