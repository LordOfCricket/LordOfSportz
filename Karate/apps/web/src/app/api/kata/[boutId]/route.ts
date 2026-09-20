import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE_NAME } from "@karate/constants";
import { callBackend } from "@/lib/server/backend-client";
import type { KataLiveState } from "@/lib/server/domain";

/** Thin client-pollable proxy, mirroring /api/kumite/[boutId] — the browser cannot read the httpOnly access-token cookie directly. */
export async function GET(_req: Request, { params }: { params: { boutId: string } }) {
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  if (!accessToken) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: "Not signed in.", requestId: "n/a", timestamp: new Date().toISOString() },
      },
      { status: 401 },
    );
  }
  const result = await callBackend<KataLiveState>(`/api/v1/bouts/${params.boutId}/kata`, { accessToken });
  return NextResponse.json(result.body, { status: result.status });
}
