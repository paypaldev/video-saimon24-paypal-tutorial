import { NextResponse } from "next/server";

export type ErrorCode =
  | "unauthorized"
  | "invalid_input"
  | "quota_exceeded"
  | "provider_error"
  | "storage_error"
  | "not_found";

export type ApiError = {
  error: { code: ErrorCode; message: string } & Record<string, unknown>;
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(
  status: number,
  code: ErrorCode,
  message: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json<ApiError>(
    { error: { code, message, ...extra } },
    { status },
  );
}
