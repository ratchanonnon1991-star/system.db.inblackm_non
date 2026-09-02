import { NextResponse } from "next/server";

export function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function jsonOk(data, status = 200) {
  return NextResponse.json(data, { status });
}

export function handleApiError(err, fallbackMessage) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(err);
  }
  const message = err.message && err.message !== fallbackMessage ? err.message : fallbackMessage;
  return jsonError(message, status);
}
