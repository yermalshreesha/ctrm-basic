#!/usr/bin/env node
// npm run rollback -- <commit-sha> [--dry-run]
//
// Opens a pull request into main that reverts <commit-sha>, instead of
// pushing directly to main (blocked by this repo's branch protection).
// See intent/plan.md Phase 22 and intent/spec.md §11 decision 9.
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ROLLBACK_REPO_ROOT lets backend/test/rollback.test.ts point this script at
// an isolated throwaway git repo instead of the real one -- never set this
// yourself when actually rolling back.
const repoRoot = process.env.ROLLBACK_REPO_ROOT
  ? path.resolve(process.env.ROLLBACK_REPO_ROOT)
  : path.resolve(__dirname, "..");

function usage() {
  console.error("Usage: npm run rollback -- <commit-sha> [--dry-run]");
  console.error(
    "  Reverts <commit-sha> on a new revert-<short-sha> branch and opens a pull request into main.",
  );
}

export function parseArgs(argv) {
  let sha;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else if (sha) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    } else {
      sha = arg;
    }
  }
  if (!sha) {
    throw new Error("Missing <commit-sha> argument.");
  }
  return { sha, dryRun };
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function gitOk(args) {
  try {
    execFileSync("git", args, { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function commandSucceeds(command, args) {
  try {
    const result = spawnSync(command, args, { cwd: repoRoot, stdio: "ignore" });
    return result.status === 0;
  } catch {
    return false;
  }
}

function runMutating(description, command, args, dryRun) {
  console.log(`[rollback] ${description}`);
  if (dryRun) {
    console.log(`[dry-run] would run: ${command} ${args.join(" ")}`);
    return;
  }
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" });
  if (result.status !== 0) {
    throw new RollbackError(`command failed (exit ${result.status}): ${command} ${args.join(" ")}`);
  }
}

class RollbackError extends Error {}

function buildCompareUrl(branch) {
  let remote;
  try {
    remote = git(["remote", "get-url", "origin"]);
  } catch {
    return null;
  }
  const match = remote.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
  if (!match) return null;
  const [, owner, repo] = match;
  return `https://github.com/${owner}/${repo}/compare/main...${branch}?expand=1`;
}

export function run(argv) {
  const { sha, dryRun } = parseArgs(argv);

  // 1. The commit must actually exist locally.
  if (!gitOk(["rev-parse", "--verify", `${sha}^{commit}`])) {
    throw new RollbackError(`"${sha}" is not a commit in this repository.`);
  }
  const fullSha = git(["rev-parse", sha]);
  const shortSha = git(["rev-parse", "--short", fullSha]);

  // 2. The working tree must be clean -- cheap, local, no network -- before
  // anything that creates/switches branches or reverts.
  const status = git(["status", "--porcelain"]);
  if (status !== "") {
    throw new RollbackError(
      "working tree is not clean. Commit, stash, or discard changes before rolling back.",
    );
  }

  // 3. Make sure origin/main is current before checking ancestry/"up to date" below.
  console.log("[rollback] fetching origin/main");
  if (!gitOk(["fetch", "origin", "main"])) {
    throw new RollbackError("git fetch origin main failed -- check network/remote access.");
  }

  // 4. If a local main branch exists, it must match origin/main -- otherwise
  // the operator's own repo view of "what's on main" may be stale.
  if (gitOk(["show-ref", "--verify", "--quiet", "refs/heads/main"])) {
    const localMain = git(["rev-parse", "main"]);
    const remoteMain = git(["rev-parse", "origin/main"]);
    if (localMain !== remoteMain) {
      throw new RollbackError(
        `local main (${localMain.slice(0, 7)}) is not up to date with origin/main (${remoteMain.slice(0, 7)}). ` +
          "Update main (git checkout main && git pull) before rolling back.",
      );
    }
  }

  // 5. The commit being rolled back must actually be on main.
  if (!gitOk(["merge-base", "--is-ancestor", fullSha, "origin/main"])) {
    throw new RollbackError(
      `${fullSha} is not on main (origin/main) -- refusing to roll back a commit that was never merged there.`,
    );
  }

  const parents = git(["show", "--no-patch", "--format=%P", fullSha]);
  const isMerge = parents.split(/\s+/).filter(Boolean).length > 1;
  const subject = git(["show", "--no-patch", "--format=%s", fullSha]);

  const branch = `revert-${shortSha}`;
  const originalBranch = git(["rev-parse", "--abbrev-ref", "HEAD"]);

  console.log(
    `[rollback] plan: revert ${fullSha} ("${subject}") on a new branch "${branch}" created from origin/main, ` +
      `push "${branch}" to origin, and open a pull request into main. main itself is never pushed to.`,
  );

  // Never pushes to main: only ever pushes the revert-<sha> branch below.
  runMutating(`create branch ${branch} from origin/main`, "git", ["branch", branch, "origin/main"], dryRun);
  runMutating(`switch to ${branch}`, "git", ["switch", branch], dryRun);

  const revertArgs = ["revert", "--no-edit"];
  if (isMerge) revertArgs.push("-m", "1");
  revertArgs.push(fullSha);
  runMutating(
    `revert ${fullSha}${isMerge ? " (-m 1, merge commit)" : ""}`,
    "git",
    revertArgs,
    dryRun,
  );

  runMutating(`push ${branch} to origin (never main)`, "git", ["push", "-u", "origin", branch], dryRun);

  const title = `Revert ${shortSha}: ${subject}`;
  const body =
    `Reverts ${fullSha} via \`npm run rollback\`.\n\n` +
    "See intent/plan.md Phase 22 for the rollback runbook (emergency Render dashboard rollback vs. this " +
    "proper-fix path).";

  let prOpened = false;
  if (dryRun) {
    console.log(
      `[dry-run] would run: gh pr create --base main --head ${branch} --title "${title}" --body <body>`,
    );
  } else {
    const ghUsable = commandSucceeds("gh", ["auth", "status"]);
    if (ghUsable) {
      console.log("[rollback] opening pull request with gh");
      const result = spawnSync(
        "gh",
        ["pr", "create", "--base", "main", "--head", branch, "--title", title, "--body", body],
        { cwd: repoRoot, stdio: "inherit" },
      );
      prOpened = result.status === 0;
      if (!prOpened) {
        console.log("[rollback] gh pr create failed -- open the pull request manually (see URL below).");
      }
    } else {
      console.log("[rollback] gh is not available or not logged in -- open the pull request manually.");
    }
  }

  if (!dryRun && !prOpened) {
    const compareUrl = buildCompareUrl(branch);
    if (compareUrl) {
      console.log(`[rollback] open a pull request here: ${compareUrl}`);
    } else {
      console.log(
        `[rollback] push succeeded -- open a pull request from "${branch}" into main on your git host.`,
      );
    }
  }

  // The local revert branch isn't needed anymore -- it stays on origin for
  // the PR. Switch back to wherever this was run from, then delete it
  // locally so it doesn't linger; -D (not -d) because it's merged into the
  // PR on GitHub, not into any local branch, so a plain -d would refuse.
  runMutating(`switch back to ${originalBranch}`, "git", ["switch", originalBranch], dryRun);
  runMutating(
    `delete local branch ${branch} (it stays on origin for the pull request)`,
    "git",
    ["branch", "-D", branch],
    dryRun,
  );

  console.log(dryRun ? "[rollback] dry run complete -- no git/gh commands were executed." : "[rollback] done.");
}

function main() {
  try {
    run(process.argv.slice(2));
  } catch (err) {
    if (err instanceof RollbackError) {
      console.error(`[rollback] ${err.message}`);
    } else {
      usage();
      console.error(`[rollback] ${err.message}`);
    }
    process.exit(1);
  }
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main();
}
