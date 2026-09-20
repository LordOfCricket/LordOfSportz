import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE_NAME } from "@karate/constants";
import { callBackend } from "@/lib/server/backend-client";

export async function GET() {
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  if (!accessToken) return NextResponse.json({ success: false }, { status: 401 });
  const result = await callBackend<{ token: string; expiresInSeconds: number }>("/api/v1/auth/realtime-token", { accessToken });
  return NextResponse.json(result.body, { status: result.status });
}
