import { NextResponse } from "next/server";
import { getTurnstileConfig } from "@/lib/turnstile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const config = getTurnstileConfig();
  return NextResponse.json({
    turnstileEnabled: config.enabled,
    turnstileMisconfigured: config.requested && !config.enabled,
    turnstileSiteKey: config.enabled ? config.siteKey : "",
  });
}
