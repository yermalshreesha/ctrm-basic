import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

describe("production start wrapper (scripts/start-prod.mjs)", () => {
  it(
    "exits non-zero and never starts the server when DATABASE_URL is invalid",
    async () => {
      const { exitCode, output } = await runStartProd({
        DATABASE_URL: "postgresql://invalid:invalid@127.0.0.1:1/ctrm_dev",
        NODE_ENV: "production",
        PORT: "39213",
      });

      expect(exitCode).not.toBe(0);
      expect(output).not.toMatch(/listening on port/i);
    },
    120_000,
  );
});

function runStartProd(
  envOverrides: Record<string, string>,
): Promise<{ exitCode: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/start-prod.mjs"], {
      cwd: backendRoot,
      env: { ...process.env, ...envOverrides },
    });

    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, output }));
  });
}
