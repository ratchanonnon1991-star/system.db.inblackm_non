import { redirect } from "next/navigation";
import { canManageGameinfo } from "@/server/auth";
import { getSessionUser } from "@/server/session-user";
import { listGameinfoColumnRoleRules } from "@/server/gameinfo-column-roles";
import { listGamelistPackColumnRegistry } from "@/server/gameinfo-gamelist-packs";
import { listGameListRows } from "@/server/gameinfo-gamelist";
import GameinfoColumnRolesPage from "@/components/gameinfo-column-roles-page";
import GameinfoBackLink from "@/components/gameinfo-back-link";

export const metadata = { title: "GameInfo — สิทธิ์คอลัมน์" };

export default async function Page({ params }) {
  const { lang } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/");
  // Deciding what other people see is an admin decision, so this is gated the
  // same way the pack editor is rather than by plain GameInfo access.
  if (!canManageGameinfo(user)) redirect(`/gameinfo/${lang}`);

  const [columns, rules, games] = await Promise.all([
    listGamelistPackColumnRegistry(),
    listGameinfoColumnRoleRules(),
    listGameListRows(),
  ]);

  return (
    <div className="px-4 py-8 pb-24">
      <GameinfoBackLink
        className="mb-4 inline-flex items-center gap-1 text-sm text-linear-primary hover:underline"
        href={`/gameinfo/${lang}`}
      />
      <h1 className="mb-1 text-2xl font-bold text-linear-ink">สิทธิ์การเห็นคอลัมน์</h1>
      <p className="mb-6 max-w-2xl text-sm text-linear-ink-subtle">
        คอลัมน์แพ็กเป็นของกลางทุกเกม หน้านี้กำหนดว่า role ไหนเห็นคอลัมน์ไหน
        ตั้งเป็นค่ากลางใช้ทุกเกม แล้วค่อยตั้งเฉพาะบางเกมทับได้
      </p>
      <GameinfoColumnRolesPage
        columns={columns.map((column) => ({ key: column.columnKey, label: column.label }))}
        rules={rules}
        games={games.map((game) => ({ id: game.id, game: game.game }))}
      />
    </div>
  );
}
