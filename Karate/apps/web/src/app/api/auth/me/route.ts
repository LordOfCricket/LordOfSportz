import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE_NAME } from "@karate/constants";
import { callBackend } from "@/lib/server/backend-client";

interface CurrentUserData {
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
  status: string;
}

export async function GET() {
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  if (!accessToken) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "AUTHENTICATION_ERROR",
          message: "Not signed in.",
          requestId: "n/a",
          timestamp: new Date().toISOString(),
        },
      },
      { status: 401 },
    );
  }

  const result = await callBackend<CurrentUserData>("/api/v1/auth/me", { accessToken });
  return NextResponse.json(result.body, { status: result.status });
}
