export function loginRequiredGames(games, gameId = null) {
  return (games || []).filter((game) => !game.isDemo && !game.configError && game.catalogSupported && game.authRequired &&
    game.authState !== "verified" && (gameId == null || Number(game.gameId) === Number(gameId)));
}

// One user gesture owns the whole flow. UI supplies a sequential, cancellable
// Login dialog; scheduled jobs never invoke this browser-only coordinator.
export async function refreshWithLogin({ gameId = null, canManage, loadDashboard, connect, startRun, readRun, onProgress = () => {}, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const connected = new Set();
  async function ensureLogins(games) {
    for (const game of games) {
      if (!canManage) throw Error(`ต้องให้ผู้มีสิทธิ์จัดการเกมเชื่อม Login: ${game.gameName}`);
      if (connected.has(game.sourceId)) throw Error(`Login ของ ${game.gameName} ยังใช้ไม่ได้ กรุณาลองใหม่`);
      onProgress(`รอ Login · ${game.gameName}`);
      await connect(game);
      connected.add(game.sourceId);
      const fresh = await loadDashboard();
      const saved = fresh.games.find((item) => item.sourceId === game.sourceId);
      if (saved?.authState !== "verified" || !saved.sourceEnabled) throw Error(`ยังยืนยัน Login ของ ${game.gameName} ไม่สำเร็จ`);
    }
  }
  await ensureLogins(loginRequiredGames((await loadDashboard()).games, gameId));
  let retryRunId = null;
  // Each source can request reconnection at most once per click, including a
  // token which looked valid locally but was rejected by the actual catalog API.
  for (;;) {
    onProgress("กำลังตรวจแพ็ก…");
    let run = (await startRun({ gameId, retryRunId })).run;
    if (!run) throw Error("ไม่พบรอบตรวจข้อมูล");
    for (let attempt = 0; attempt < 90 && !["completed", "partial", "failed"].includes(run.status); attempt++) {
      await wait(2000);
      run = (await readRun(run.id)).run;
    }
    if (!["completed", "partial", "failed"].includes(run.status)) throw Error("รอบตรวจยังทำงานอยู่ กรุณารอแล้วตรวจสถานะอีกครั้ง");
    const fresh = await loadDashboard();
    const failedSources = new Set((run.sources || []).filter((source) => source.status === "failed").map((source) => source.sourceId));
    const needsLogin = loginRequiredGames(fresh.games, gameId).filter((game) => failedSources.has(game.sourceId));
    if (!needsLogin.length) return run;
    await ensureLogins(needsLogin);
    // Retry only failed sources; never count successful sources twice toward removal.
    retryRunId = run.id;
  }
}
