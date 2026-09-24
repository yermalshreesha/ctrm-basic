import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env") });

// Route the test process at the test database, not the dev one — set
// before anything imports src/db.ts, whose own dotenv.config() call
// won't clobber a DATABASE_URL that's already set.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
