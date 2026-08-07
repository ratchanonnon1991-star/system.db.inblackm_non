import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session-user";
import GameinfoImportPanel from "@/components/gameinfo-import-panel";

export const metadata = {
  title: "GameDB — นำเข้า CSV",
};

export default async function GameinfoImportPage({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role === "user") redirect(`/gameinfo/${lang}`);

  return (
    <div className="px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">นำเข้า CSV หลายเกม</h1>
      <GameinfoImportPanel lang={lang} />
    </div>
  );
}
