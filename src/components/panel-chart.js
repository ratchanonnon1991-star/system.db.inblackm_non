"use client";

import { useMemo } from "react";
import { toNumber } from "@/lib/gamedb-layout";

// Hand-rolled SVG instead of a charting dependency: the whole app ships with
// three runtime packages and this only needs bars, a polyline and some ticks.
const SERIES_COLORS = ["#dc2626", "#0284c7", "#16a34a", "#d97706", "#7c3aed", "#0f766e"];
const PADDING = { top: 16, right: 16, bottom: 46, left: 56 };

function niceTicks(max, count = 4) {
  if (max <= 0) return [0];
  const step = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const nice = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= step) * magnitude;
  const ticks = [];
  for (let value = 0; value <= max + nice / 2; value += nice) ticks.push(value);
  return ticks;
}

export default function PanelChart({ chart, columns, rows, height }) {
  const series = useMemo(() => {
    const xIndex = columns.findIndex((col) => col.id === chart.x);
    const yIndexes = chart.y
      .map((id) => ({ id, index: columns.findIndex((col) => col.id === id) }))
      .filter((item) => item.index !== -1);
    if (xIndex === -1 || yIndexes.length === 0) return null;

    const points = rows.slice(0, 60).map((row) => ({
      label: row.cells[xIndex]?.text ?? "",
      values: yIndexes.map(({ index }) => toNumber(row.cells[index]?.raw) ?? 0),
    }));
    const max = Math.max(
      0,
      ...points.flatMap((point) => point.values.map((value) => Math.max(0, value)))
    );
    return {
      points,
      max,
      names: yIndexes.map(({ id }) => columns.find((col) => col.id === id)?.label || id),
    };
  }, [chart, columns, rows]);

  if (!series) {
    return (
      <div className="flex items-center justify-center px-4 py-10 text-[11px] font-semibold text-zinc-400" style={{ height }}>
        คอลัมน์ที่ตั้งไว้สำหรับกราฟไม่อยู่ในผลลัพธ์นี้ — กดปุ่มตั้งค่ากราฟเพื่อเลือกใหม่
      </div>
    );
  }
  if (series.points.length === 0) {
    return (
      <div className="flex items-center justify-center px-4 py-10 text-[11px] font-semibold text-zinc-400" style={{ height }}>
        ไม่มีข้อมูลสำหรับวาดกราฟ
      </div>
    );
  }

  const width = Math.max(420, series.points.length * (series.names.length * 14 + 26) + 120);
  const plotWidth = width - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const ticks = niceTicks(series.max);
  const scaleY = (value) =>
    PADDING.top + plotHeight - (series.max ? (value / ticks[ticks.length - 1]) * plotHeight : 0);
  const bandWidth = plotWidth / series.points.length;

  return (
    <div className="overflow-x-auto" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label="กราฟผลลัพธ์">
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={scaleY(tick)}
              y2={scaleY(tick)}
              stroke="#e4e4e7"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 8}
              y={scaleY(tick) + 3}
              textAnchor="end"
              fontSize="9"
              fill="#a1a1aa"
              fontWeight="700"
            >
              {tick.toLocaleString("th-TH", { maximumFractionDigits: 2 })}
            </text>
          </g>
        ))}

        {series.points.map((point, pointIndex) => {
          const bandX = PADDING.left + pointIndex * bandWidth;
          return (
            <text
              key={`label-${pointIndex}`}
              x={bandX + bandWidth / 2}
              y={height - PADDING.bottom + 14}
              textAnchor="end"
              fontSize="9"
              fill="#71717a"
              fontWeight="700"
              transform={`rotate(-35 ${bandX + bandWidth / 2} ${height - PADDING.bottom + 14})`}
            >
              {point.label.length > 18 ? `${point.label.slice(0, 17)}…` : point.label}
            </text>
          );
        })}

        {chart.type === "bar"
          ? series.points.map((point, pointIndex) =>
              point.values.map((value, seriesIndex) => {
                const barWidth = Math.max(
                  2,
                  (bandWidth * 0.7) / point.values.length
                );
                const x =
                  PADDING.left +
                  pointIndex * bandWidth +
                  bandWidth * 0.15 +
                  seriesIndex * barWidth;
                const y = scaleY(Math.max(0, value));
                return (
                  <rect
                    key={`bar-${pointIndex}-${seriesIndex}`}
                    x={x}
                    y={y}
                    width={barWidth - 1}
                    height={Math.max(0, PADDING.top + plotHeight - y)}
                    fill={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
                    opacity={0.9}
                  >
                    <title>{`${point.label} · ${series.names[seriesIndex]}: ${value.toLocaleString("th-TH")}`}</title>
                  </rect>
                );
              })
            )
          : series.names.map((name, seriesIndex) => (
              <polyline
                key={`line-${name}-${seriesIndex}`}
                fill="none"
                stroke={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
                strokeWidth={2}
                points={series.points
                  .map(
                    (point, pointIndex) =>
                      `${PADDING.left + pointIndex * bandWidth + bandWidth / 2},${scaleY(
                        Math.max(0, point.values[seriesIndex])
                      )}`
                  )
                  .join(" ")}
              />
            ))}

        <line
          x1={PADDING.left}
          x2={PADDING.left}
          y1={PADDING.top}
          y2={PADDING.top + plotHeight}
          stroke="#d4d4d8"
        />

        {series.names.map((name, index) => (
          <g key={`legend-${name}`} transform={`translate(${PADDING.left + index * 130}, ${height - 10})`}>
            <rect width={9} height={9} y={-8} fill={SERIES_COLORS[index % SERIES_COLORS.length]} rx={2} />
            <text x={14} fontSize="9" fill="#52525b" fontWeight="700">
              {name.length > 16 ? `${name.slice(0, 15)}…` : name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
