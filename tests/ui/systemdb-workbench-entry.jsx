import React from "react";
import { createRoot } from "react-dom/client";
import SystemDbWorkbench from "../../src/components/systemdb-workbench.js";

const role = new URL(location.href).searchParams.get("role") || "admin";
const me = { id: role === "user" ? 2 : role === "staff" ? 3 : 1, username: `qa-${role}`, displayName: "Topup QA", role,
  defaultViewId: 10, canWriteData: role === "admin", canUpdateData: role !== "user" };
createRoot(document.getElementById("root")).render(<><span className="systemdb-local-qa-label">LOCAL QA · ข้อมูลทดสอบ</span><SystemDbWorkbench me={me}
  initialViewId={new URL(location.href).searchParams.get("view") || undefined}
  onBackToMenu={() => { window.location.reload(); }}
  onOpenBuilder={() => { document.getElementById("builder-notice").showModal(); }} />
  <dialog id="builder-notice"><form method="dialog"><h2>เครื่องมือตารางเดิม</h2><p>แอปจริงเปิด GamedbWorkspace เดิมจาก SystemDbScreen; พรีวิวนี้ทดสอบเฉพาะหน้าทำงานใหม่</p><button>กลับตาราง</button></form></dialog></>);
