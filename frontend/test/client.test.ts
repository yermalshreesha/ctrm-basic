import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient } from "../src/api/client";

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

describe("apiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws an ApiError carrying the backend's message on a not_found response", async () => {
    mockFetchOnce(404, { error: "not_found", message: "Trade abc not found" });

    const rejection = apiClient.get("/trades/abc");
    await expect(rejection).rejects.toBeInstanceOf(ApiError);
    await expect(rejection).rejects.toThrow("Trade abc not found");
    await expect(rejection).rejects.toMatchObject({ status: 404 });
  });

  it("joins field-level messages when the backend returns a validation_failed body", async () => {
    mockFetchOnce(400, {
      error: "validation_failed",
      fields: [{ field: "quantityMt", message: "must be greater than 0" }],
    });

    await expect(apiClient.post("/trades", {})).rejects.toThrow("quantityMt: must be greater than 0");
  });
});
