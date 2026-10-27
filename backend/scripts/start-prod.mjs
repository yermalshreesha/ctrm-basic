import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Chains Render's single start command: migrate -> seed -> server. Both
// `prisma migrate deploy` and the seed script are idempotent, so running
// them on every boot (including every cold-start wake from sleep) is safe.
// A failure in either step aborts before the server starts, so a broken
// deploy fails loudly instead of serving a half-applied database.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
config({ path: path.resolve(backendRoot, "../.env") });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: backendRoot,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  const status = result.status ?? 1;
  if (status !== 0) {
    process.exit(status);
  }
}

run("prisma", ["migrate", "deploy"]);
run("tsx", ["prisma/seed.ts"]);
run("node", ["dist/server.js"]);
