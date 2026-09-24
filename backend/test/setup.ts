import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { afterEach } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env") });

// Route the test process at the test database, not the dev one — set
// before anything imports src/db.ts, whose own dotenv.config() call
// won't clobber a DATABASE_URL that's already set.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Tests truncate tables between runs — refuse to proceed unless that is
// unambiguously pointed at ctrm_test, so a misconfigured .env can never
// cause a truncate against ctrm_dev.
if (!process.env.DATABASE_URL || !/\/ctrm_test(\?.*)?$/.test(process.env.DATABASE_URL)) {
  throw new Error(
    // Report only the database name, never the full URL — it contains
    // the DB password.
    `Refusing to run tests: DATABASE_URL must point at the ctrm_test database, got database "${databaseNameOf(
      process.env.DATABASE_URL,
    )}".`,
  );
}

function databaseNameOf(url: string | undefined): string {
  if (!url) return "(unset)";
  try {
    return new URL(url).pathname.replace(/^\//, "") || "(no database name)";
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

// Imported dynamically, after the DATABASE_URL override above — a static
// import would be hoisted and evaluated before that line runs.
const { prisma } = await import("../src/db.js");

afterEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Commodity", "Counterparty", "Warehouse", "Trade" RESTART IDENTITY CASCADE',
  );
});
