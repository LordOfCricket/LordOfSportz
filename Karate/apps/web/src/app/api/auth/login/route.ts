import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { callBackend } from "@/lib/server/backend-client";
import { setAuthCookies } from "@/lib/server/auth-cookies";

interface LoginData {
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
  accessToken: string;
  refreshToken: string;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Malformed JSON body.",
          requestId: "n/a",
          timestamp: new Date().toISOString(),
        },
      },
      { status: 400 },
    );
  }

  const result = await callBackend<LoginData>("/api/v1/auth/login", { method: "POST", body });

  if (!result.body.success) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const { accessToken, refreshToken, ...user } = result.body.data;
  const response = NextResponse.json(
    { success: true, data: user, meta: result.body.meta },
    { status: result.status },
  );
  setAuthCookies(response, { accessToken, refreshToken });
  return response;
}
