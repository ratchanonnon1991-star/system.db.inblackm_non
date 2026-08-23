import ItuneTopupLog from "@/components/itune-topup-log";
import { redirect } from "next/navigation";

export default async function ItuneTopupLogPage({ params, searchParams }) {
  const [{ lang }, query] = await Promise.all([params, searchParams]);
  if (query?.tab === "history") redirect(`/projectm/${lang}/itune/admin/history?category=claim`);
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ll-ink">
          ผู้ถือเมลปัจจุบัน
        </h1>
        <p className="mt-1 text-[13px] text-ll-ink-subtle">
          ดูว่าใครกำลังถือเมลใดอยู่ในขณะนี้
        </p>
      </div>
      <ItuneTopupLog />
    </>
  );
}
