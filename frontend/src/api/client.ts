// Thin fetch wrapper for the backend API. Requests go to a relative
// `/api/...` path, which Vite's dev server proxies to the backend
// (see vite.config.ts) — this avoids CORS entirely instead of requiring
// a `cors` middleware on the backend.

import type { ApiErrorBody } from "./types";

// Every non-2xx backend response carries either a top-level `message`
// (not_found, invalid_transition, insufficient_stock, ...) or field-level
// `fields` (validation_failed) — never both. Prefer whichever is present
// so callers reading `err.message` see the backend's own words instead of
// a generic "request failed" string.
function messageFromBody(status: number, body: unknown): string {
  const errorBody = body as Partial<ApiErrorBody> | null;
  if (errorBody?.message) return errorBody.message;
  if (errorBody?.fields?.length) {
    return errorBody.fields.map((f) => `${f.field}: ${f.message}`).join("; ");
  }
  return `API request failed with status ${status}`;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(messageFromBody(status, body));
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, body);
  }

  return body as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
