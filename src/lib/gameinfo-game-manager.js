export function buildGameinfoUpdate(draft, dataMode = "uid") {
  const fields = {
    region: draft.region,
    platform: draft.platform,
    server: draft.server,
    botManual: draft.botManual,
  };
  if (dataMode !== "idpass") fields.game = draft.game;
  return fields;
}

export function buildGameinfoStatusUpdate(status) {
  return {
    enabled: status !== "offline",
    isNew: status === "new",
  };
}
