import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// The Prisma CLI (unlike src/db.ts) doesn't load the repo-root .env on its
// own, since it isn't run through Node code that calls dotenv itself — load
// it here before spawning the CLI command.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env") });

const [, , command, ...args] = process.argv;
const result = spawnSync(command, args, {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
