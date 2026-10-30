#!/usr/bin/env node
// Reads the health-check result the health-monitor workflow just produced
// (via env vars) and files a GitHub issue labelled "incident" -- or
// updates the existing open one instead of filing a duplicate. Never
// restarts, redeploys, or changes anything itself -- see
// intent/plan.md Phase 24 and intent/changes/010-health-monitor.md.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "incident";

export function buildBody({
  monitorUrl,
  status,
  responseMs,
  body,
  checkedAt,
  simulated,
}) {
  const lines = [
    "## Problem",
    simulated
      ? `A manually-triggered **simulated** failure of the health monitor -- this is a demo run, not a real outage. It deliberately checked a non-existent path under \`${monitorUrl}\`.`
      : `Production (\`${monitorUrl}\`) did not report healthy after retrying for 3 minutes (covering the free tier's wake-up delay).`,
    "",
    "## Evidence",
    `- Status code: ${status}`,
    `- Response time (last attempt): ${responseMs}`,
    `- Checked at: ${checkedAt}`,
    "- Response body (last attempt):",
    "```",
    body && body.trim() !== "" ? body.trim() : "(empty)",
    "```",
    "",
    "## Proposed outcome",
    simulated
      ? "No action needed -- this issue exists to prove the incident-filing path works. Close it once reviewed."
      : "Production should respond 200 from /api/health again. Investigate why it isn't (service down, crashed on boot, database unreachable, etc.) and restore it.",
    "",
    "## Affected systems",
    "- Production backend (`ctrm-production` on Render)",
    "- Anyone currently using the hosted demo",
    "",
    "## Open questions",
    "- Is this a one-off (free-tier cold start taking longer than 3 minutes) or a real failure?",
    "- Did the most recent deploy to production correlate with this?",
  ];
  return lines.join("\n");
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

function findOpenIssueNumber() {
  const json = gh([
    "issue",
    "list",
    "--label",
    LABEL,
    "--state",
    "open",
    "--limit",
    "1",
    "--json",
    "number",
  ]);
  const issues = JSON.parse(json);
  return issues.length > 0 ? issues[0].number : null;
}

export function report({
  monitorUrl,
  status,
  responseMs,
  body,
  checkedAt,
  simulated,
}) {
  const issueBody = buildBody({
    monitorUrl,
    status,
    responseMs,
    body,
    checkedAt,
    simulated,
  });
  const title = simulated
    ? "Incident (simulated): health monitor demo run"
    : "Incident: production health check failing";

  // Created once; a no-op if it already exists.
  execFileSync("gh", [
    "label",
    "create",
    LABEL,
    "--color",
    "D93F0B",
    "--description",
    "Opened or updated automatically by the health-monitor workflow",
    "--force",
  ]);

  const existingIssue = findOpenIssueNumber();
  if (existingIssue) {
    console.log(`[health-monitor] updating existing issue #${existingIssue}`);
    gh(["issue", "edit", String(existingIssue), "--title", title, "--body", issueBody]);
    gh([
      "issue",
      "comment",
      String(existingIssue),
      "--body",
      `Re-checked at ${checkedAt} -- still unhealthy (status ${status}). Evidence above refreshed.`,
    ]);
  } else {
    console.log("[health-monitor] filing a new issue");
    gh(["issue", "create", "--title", title, "--label", LABEL, "--body", issueBody]);
  }
}

function main() {
  report({
    monitorUrl: process.env.MONITOR_URL ?? "",
    status: process.env.HEALTH_STATUS ?? "unknown",
    responseMs: process.env.HEALTH_RESPONSE_MS ?? "n/a",
    body: process.env.HEALTH_BODY ?? "",
    checkedAt: process.env.HEALTH_CHECKED_AT ?? new Date().toISOString(),
    simulated: process.env.SIMULATE_FAILURE === "true",
  });
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main();
}
