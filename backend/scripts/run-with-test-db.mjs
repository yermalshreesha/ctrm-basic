import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env") });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const [, , command, ...args] = process.argv;
const result = spawnSync(command, args, {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
