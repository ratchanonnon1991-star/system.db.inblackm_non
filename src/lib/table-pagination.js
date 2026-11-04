export const TABLE_PAGE_SIZES = [25, 50, 100, 200];

export function tablePage(total, page = 1, pageSize = 25) {
  const count = Math.max(0, Math.trunc(Number(total)) || 0);
  const size = Math.min(200, Math.max(1, Math.trunc(Number(pageSize)) || 25));
  const pages = Math.max(1, Math.ceil(count / size));
  const current = Math.min(pages, Math.max(1, Math.trunc(Number(page)) || 1));
  const start = (current - 1) * size;
  return { page: current, pageSize: size, total: count, totalPages: pages, start, end: Math.min(count, start + size) };
}
