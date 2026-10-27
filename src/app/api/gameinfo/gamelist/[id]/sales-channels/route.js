import { handleApiError, jsonOk } from "@/lib/http";
import { requireGameinfoEditor } from "@/server/auth";
import { saveGamelistSalesChannels } from "@/server/gameinfo-sales-channels";
import { auditActor } from "@/server/gameinfo-gamelist-packs";

// The editor sends the whole list; channels left out or emptied are removed.
export async function PUT(request, { params }) {
  try {
    const user = await requireGameinfoEditor(request);
    const { id } = await params;
    const { channels } = await request.json();
    return jsonOk({ channels: await saveGamelistSalesChannels(Number(id), channels, { actor: auditActor(user), replace: true }) });
  } catch (error) {
    return handleApiError(error, "บันทึกช่องทางขายไม่สำเร็จ");
  }
}
