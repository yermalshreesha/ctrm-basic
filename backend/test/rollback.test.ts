import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

// These tests never touch the real repo or a real remote: scripts/rollback.mjs
// reads ROLLBACK_REPO_ROOT (set below) to run every git command against a
// disposable local repo + local bare "origin" instead, so a dirty working
// tree here, or a run during this very session's own uncommitted changes,
// can never make these tests flaky or risk pushing anything real.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const rollbackScript = path.join(projectRoot, "scripts", "rollback.mjs");

let tmpRoot: string;
let originDir: string;
let cloneDir: string;
let onMainSha: string;
let unreachableSha: string;

function git(args: string[], cwd: string) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-test-"));
  originDir = path.join(tmpRoot, "origin.git");
  cloneDir = path.join(tmpRoot, "clone");

  execFileSync("git", ["init", "--bare", originDir]);
  execFileSync("git", ["clone", originDir, cloneDir]);
  git(["config", "user.email", "test@example.com"], cloneDir);
  git(["config", "user.name", "Rollback Test"], cloneDir);
  git(["checkout", "-b", "main"], cloneDir);

  fs.writeFileSync(path.join(cloneDir, "a.txt"), "1\n");
  git(["add", "-A"], cloneDir);
  git(["commit", "-m", "commit1"], cloneDir);
  git(["push", "-u", "origin", "main"], cloneDir);

  fs.writeFileSync(path.join(cloneDir, "b.txt"), "2\n");
  git(["add", "-A"], cloneDir);
  git(["commit", "-m", "commit2"], cloneDir);
  git(["push", "origin", "main"], cloneDir);

  onMainSha = git(["rev-parse", "HEAD"], cloneDir);

  // A commit object that exists but was never pushed/attached to any branch
  // -- guaranteed not to be an ancestor of origin/main.
  const tree = git(["rev-parse", "HEAD^{tree}"], cloneDir);
  unreachableSha = git(["commit-tree", tree, "-p", onMainSha, "-m", "unreachable"], cloneDir);
});

afterEach(() => {
  const scratch = path.join(cloneDir, "scratch.txt");
  if (fs.existsSync(scratch)) fs.unlinkSync(scratch);
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("npm run rollback (scripts/rollback.mjs)", () => {
  it("refuses a commit that isn't on main", async () => {
    const { exitCode, output } = await runRollback([unreachableSha, "--dry-run"]);

    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/is not on main/i);
  });

  it("refuses a dirty working tree", async () => {
    fs.writeFileSync(path.join(cloneDir, "scratch.txt"), "dirty\n");

    const { exitCode, output } = await runRollback([onMainSha, "--dry-run"]);

    expect(exitCode).not.toBe(0);
    expect(output).toMatch(/working tree is not clean/i);
  });

  it("never pushes to main, only the revert branch, in dry-run mode", async () => {
    const { exitCode, output } = await runRollback([onMainSha, "--dry-run"]);

    expect(exitCode).toBe(0);
    expect(output).toMatch(/would run: git push -u origin revert-/);
    // No printed git command (dry-run or real) ever targets main directly.
    const commandLines = output.split("\n").filter((line) => /would run: git /.test(line));
    expect(commandLines.length).toBeGreaterThan(0);
    for (const line of commandLines) {
      expect(line).not.toMatch(/\bgit push\b[^|]*\bmain\b/);
    }
  });
});

function runRollback(args: string[]): Promise<{ exitCode: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [rollbackScript, ...args], {
      cwd: cloneDir,
      env: { ...process.env, ROLLBACK_REPO_ROOT: cloneDir },
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
