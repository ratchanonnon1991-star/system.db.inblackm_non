import ItuneAdminTable from "@/components/itune-admin-table";
import { listItuneEntries } from "@/server/itune-entries-repository";

export default async function ItuneAdminPage() {
  let entries = null;
  let loadError = null;
  try {
    entries = await listItuneEntries();
  } catch (err) {
    loadError = err.message || "โหลดข้อมูลไม่สำเร็จ";
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ll-ink">รายการเมล</h1>
        <p className="mt-1 text-[13px] text-ll-ink-subtle">
          ค้นหา เพิ่ม และแก้ไขข้อมูลเมลทั้งหมด
        </p>
      </div>
      {loadError ? (
        <div className="rounded-lg border border-ll-warning/40 bg-ll-warning-bg p-6 text-sm text-ll-warning">
          {loadError}
        </div>
      ) : (
        <ItuneAdminTable initialEntries={entries} />
      )}
    </>
  );
}
