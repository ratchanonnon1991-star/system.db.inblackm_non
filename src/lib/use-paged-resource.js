"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createInventoryReadSession } from "@/lib/inventory-read-session";

export function usePagedResource(endpoint, params, { setPage } = {}) {
  const [response, setResponse] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [settledView, setSettledView] = useState(null);
  const [version, setVersion] = useState(0), [reader] = useState(() => createInventoryReadSession());
  const snapshot = useRef(null), previous = useRef(null), generation = useRef(0);
  const paramsKey = JSON.stringify(params);
  const view = JSON.stringify([endpoint, paramsKey, version]);
  const reload = useCallback(() => { generation.current++; snapshot.current = null; reader.cancel(); setVersion((value) => value + 1); }, [reader]);
  useEffect(() => {
    const query = JSON.parse(paramsKey), currentGeneration = ++generation.current; let active = true;
    const sameResource = previous.current?.endpoint === endpoint;
    const searchChanged = sameResource && previous.current.search !== query.search;
    if (!sameResource) snapshot.current = null;
    previous.current = { endpoint, search: query.search };
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      const urlParams = new URLSearchParams(Object.entries(query).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)]));
      if (snapshot.current) urlParams.set("snapshot", snapshot.current);
      else if (version) urlParams.set("fresh", "1");
      const url = `${endpoint}?${urlParams}`;
      try {
        const result = await reader.run(url, url);
        if (!result?.pagination || !Number.isFinite(result.pagination.total)) throw new Error("ข้อมูลแบ่งหน้าไม่ครบ กรุณาโหลดใหม่");
        if (active && generation.current === currentGeneration) { snapshot.current = result.pagination.snapshot; setResponse({ endpoint, value: result }); if (setPage && result.pagination.page !== query.page) setPage(result.pagination.page); }
      } catch (e) { if (active && generation.current === currentGeneration && e.name !== "AbortError") setError(e.message); }
      finally { if (active && generation.current === currentGeneration) { setSettledView(view); setLoading(false); } }
    }, searchChanged ? 250 : 0);
    return () => { active = false; clearTimeout(timer); reader.cancel(); };
  }, [endpoint, paramsKey, version, view, reader, setPage]);
  const pending = settledView !== view;
  return { data: response?.endpoint === endpoint ? response.value : null, loading: pending || loading, error: pending ? "" : error, setError, reload };
}
