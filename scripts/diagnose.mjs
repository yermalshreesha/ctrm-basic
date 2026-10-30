#!/usr/bin/env node
// npm run diagnose -- <issue-number>
//
// Reads an "incident" issue filed by the health-monitor workflow, asks
// Claude to investigate the repository read-only, and has it write a
// single draft intent file under intent/changes/ describing what it
// found -- never touching application code or any existing file. Run
// locally only, never in CI (that would need an API key -- out of scope
// for intent/changes/010-health-monitor.md). See intent/plan.md Phase 24.
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const changesDir = path.join(repoRoot, "intent", "changes");

function usage() {
  console.error("Usage: npm run diagnose -- <issue-number>");
  console.error("  Reads incident issue <issue-number> with gh, investigates the repo");
  console.error("  read-only, and writes a draft intent/changes/*.md file. No code is changed.");
}

export function nextChangeNumber(existingFiles) {
  const numbers = existingFiles
    .map((f) => f.match(/^(\d+)-/))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return String(max + 1).padStart(3, "0");
}

export function buildPrompt({ issueNumber, issue, nextNumber }) {
  return [
    `An automated health check filed GitHub issue #${issueNumber}, "${issue.title}":`,
    "",
    "---",
    issue.body,
    "---",
    "",
    "Investigate this repository to understand what's likely wrong -- read the " +
      "code, tests, recent git history, and docs under intent/. Do not change " +
      "any existing file, run any command that mutates the repo or a database, " +
      "or deploy/rollback/restart anything.",
    "",
    `Write exactly one new file, intent/changes/${nextNumber}-<short-kebab-slug>.md ` +
      "(pick the slug; the number above is the next free one -- check intent/changes/ " +
      "yourself in case a newer file was added since), following the same template as " +
      "the other files in intent/changes/ (see e.g. intent/changes/009-security-scan.md): " +
      '"# Change: <title>" heading, "Requested by" / "Status: draft", then ' +
      '"## What they asked for", "## Details", "## Affects existing", "## Out of scope", ' +
      '"## Open questions". Base it on what you actually find investigating the repo, not ' +
      `just the issue text. Reference issue #${issueNumber} in it. Do not create, edit, or ` +
      "delete any other file.",
  ].join("\n");
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

export function run(argv) {
  const issueNumber = argv[0];
  if (!issueNumber || !/^\d+$/.test(issueNumber)) {
    usage();
    throw new Error("Missing or invalid <issue-number> argument.");
  }

  console.log(`[diagnose] reading issue #${issueNumber}`);
  const issue = JSON.parse(gh(["issue", "view", issueNumber, "--json", "number,title,body,url"]));

  const existingFiles = readdirSync(changesDir).filter((f) => f.endsWith(".md"));
  const nextNumber = nextChangeNumber(existingFiles);
  const prompt = buildPrompt({ issueNumber, issue, nextNumber });

  console.log(
    `[diagnose] asking Claude to investigate read-only and draft intent/changes/${nextNumber}-*.md`,
  );
  const result = spawnSync(
    "claude",
    [
      "-p",
      prompt,
      "--allowedTools",
      "Read,Grep,Glob,Bash(gh issue view:*),Bash(git log:*),Bash(git show:*),Write(intent/changes/*)",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );

  if (result.error) {
    throw new Error(`failed to run claude: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`claude exited with status ${result.status}`);
  }
  console.log("[diagnose] done -- review the new file under intent/changes/ before committing anything.");
}

function main() {
  try {
    run(process.argv.slice(2));
  } catch (err) {
    console.error(`[diagnose] ${err.message}`);
    process.exit(1);
  }
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main();
}
