const DEFAULT_ERROR = "เกิดข้อผิดพลาด";

export async function apiJson(url, options = {}) {
  const { fallbackError = DEFAULT_ERROR, ...fetchOptions } = options;
  const res = await fetch(url, { credentials: "include", ...fetchOptions });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || fallbackError);
    err.status = res.status;
    throw err;
  }
  return data;
}
