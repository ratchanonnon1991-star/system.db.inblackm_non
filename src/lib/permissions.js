export const PERMISSIONS = [
  { key: "systemdb.data.insert_delete", site: "System DB", label: "เพิ่ม/ลบแถว", path: "/systemdb" },
  { key: "systemdb.data.update", site: "System DB", label: "แก้ไขข้อมูล", path: "/systemdb" },
  { key: "projectm.claim", site: "Projectm", label: "Topup", path: "/projectm/[lang]/itune/topup" },
  { key: "projectm.admin", site: "Projectm", label: "Admin", path: "/projectm/[lang]/itune/admin" },
  { key: "gameinfo.access", site: "GameInfo", label: "ดูข้อมูล", path: "/gameinfo/[lang]" },
  { key: "gameinfo.report", site: "GameInfo", label: "รายงานปัญหา", path: "/gameinfo/[lang]/[id]" },
  { key: "gameinfo.market_check", site: "GameInfo", label: "ตรวจราคา Market", path: "/gameinfo/[lang]/market-checks" },
  { key: "gameinfo.admin", site: "GameInfo", label: "Admin", path: "/gameinfo/[lang]" },
  { key: "profit.access", site: "Profit", label: "ดูข้อมูล", path: "/profit" },
  { key: "profit.admin", site: "Profit", label: "แก้ไขข้อมูล", path: "/profit" },
];

export const PERMISSION_KEYS = new Set(PERMISSIONS.map(({ key }) => key));

export const PERMISSION_PRESETS = {
  projectmTopup: ["projectm.claim"],
  projectmAdmin: ["projectm.claim", "projectm.admin"],
  gameinfoTopup: ["gameinfo.access", "gameinfo.report"],
  gameinfoAdmin: ["gameinfo.access", "gameinfo.report", "gameinfo.market_check", "gameinfo.admin"],
  profitAdmin: ["profit.access", "profit.admin"],
};

export function normalizePermissions(values = []) {
  const permissions = new Set(values.filter((key) => PERMISSION_KEYS.has(key)));
  if (permissions.has("projectm.admin")) PERMISSION_PRESETS.projectmAdmin.forEach((key) => permissions.add(key));
  if (permissions.has("gameinfo.admin")) PERMISSION_PRESETS.gameinfoAdmin.forEach((key) => permissions.add(key));
  if (permissions.has("gameinfo.report")) permissions.add("gameinfo.access");
  if (permissions.has("gameinfo.market_check")) permissions.add("gameinfo.access");
  if (permissions.has("profit.admin")) PERMISSION_PRESETS.profitAdmin.forEach((key) => permissions.add(key));
  return [...permissions].sort();
}

export function togglePermission(values, key, checked) {
  const permissions = new Set(values || []);
  if (checked) permissions.add(key);
  else {
    permissions.delete(key);
    if (key === "projectm.claim") permissions.delete("projectm.admin");
    if (key === "gameinfo.access") ["gameinfo.report", "gameinfo.market_check", "gameinfo.admin"].forEach((item) => permissions.delete(item));
    if (key === "gameinfo.report") permissions.delete("gameinfo.admin");
    if (key === "gameinfo.market_check") permissions.delete("gameinfo.admin");
    if (key === "profit.access") permissions.delete("profit.admin");
  }
  return normalizePermissions([...permissions]);
}

export function legacyPermissions({ canWriteData, canUpdateData, projectmRole, gameinfoRole } = {}) {
  return normalizePermissions([
    canWriteData && "systemdb.data.insert_delete",
    canUpdateData && "systemdb.data.update",
    ...(projectmRole === "admin"
      ? PERMISSION_PRESETS.projectmAdmin
      : projectmRole === "topup"
        ? PERMISSION_PRESETS.projectmTopup
        : []),
    ...(gameinfoRole === "admin"
      ? PERMISSION_PRESETS.gameinfoAdmin
      : gameinfoRole === "topup"
        ? PERMISSION_PRESETS.gameinfoTopup
        : []),
  ].filter(Boolean));
}

export function permissionRole(permissions, site) {
  const set = new Set(permissions || []);
  if (set.has(`${site}.admin`)) return "admin";
  if (set.has(site === "projectm" ? "projectm.claim" : `${site}.access`)) return "topup";
  return null;
}

export function hasPermission(user, key) {
  if (!user) return false;
  if (key === "systemdb.data.insert_delete" && user.role === "admin") return true;
  if (key === "systemdb.data.update" && user.role === "admin") return true;
  return (user.permissions || legacyPermissions(user)).includes(key);
}
