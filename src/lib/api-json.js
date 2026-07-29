const DEFAULT_ERROR = "เกิดข้อผิดพลาด";

export async function apiJson(url, options = {}) {
  const { fallbackError = DEFAULT_ERROR, ...fetchOptions } = options;
  const res = await fetch(url, { credentials: "include", ...fetchOptions });

  // Read the body as text first. `res.json()` would throw where the parser gave
  // up -- "Unexpected token '<'" -- and take the status code down with it, so a
  // proxy's error page, a wrong path or an HTML 500 all looked like one another.
  const body = await res.text();
  let data = null;
  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      const err = new Error(
        `${fallbackError} — เซิร์ฟเวอร์ตอบกลับมาไม่ใช่ JSON (HTTP ${res.status})`
      );
      err.status = res.status;
      err.body = body.slice(0, 500);
      throw err;
    }
  }

  if (!res.ok) {
    const err = new Error(data?.error || `${fallbackError} (HTTP ${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
