#!/usr/bin/env node
// node scripts/security-scan-report.mjs <audit-json-path>
//
// Reads the output of `npm audit --json` and, if it contains any
// high/critical vulnerabilities, files a GitHub issue labelled
// "security-scan" (or updates the existing open one instead of filing
// a duplicate). Never installs, fixes, or changes anything itself --
// see intent/plan.md Phase 23 and intent/changes/009-security-scan.md.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "security-scan";
const HIGH_SEVERITIES = new Set(["high", "critical"]);

export function findHighSeverityVulnerabilities(audit) {
  const vulnerabilities = audit.vulnerabilities ?? {};
  return Object.values(vulnerabilities)
    .filter((v) => HIGH_SEVERITIES.has(v.severity))
    .map((v) => ({
      name: v.name,
      severity: v.severity,
      fixAvailable: Boolean(v.fixAvailable),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildSummary(findings, scannedAt) {
  const counts = { critical: 0, high: 0 };
  for (const f of findings) counts[f.severity]++;

  const lines = [
    `npm audit found ${counts.critical} critical and ${counts.high} high severity ` +
      `${findings.length === 1 ? "vulnerability" : "vulnerabilities"} as of ${scannedAt}.`,
    "",
    "| Package | Severity | Fix available |",
    "| --- | --- | --- |",
    ...findings.map((f) => `| ${f.name} | ${f.severity} | ${f.fixAvailable ? "yes" : "no"} |`),
    "",
    "Run `npm audit` locally for full details, then fix through the normal PR process -- " +
      "this workflow only reports findings, it never changes packages itself.",
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

export function report(findings, { scannedAt = new Date().toISOString() } = {}) {
  if (findings.length === 0) {
    console.log("[security-scan] no high/critical vulnerabilities found.");
    return;
  }

  const summary = buildSummary(findings, scannedAt);

  // Created once; a no-op if it already exists.
  execFileSync("gh", [
    "label",
    "create",
    LABEL,
    "--color",
    "B60205",
    "--description",
    "Opened or updated automatically by the security-scan workflow",
    "--force",
  ]);

  const existingIssue = findOpenIssueNumber();
  if (existingIssue) {
    console.log(`[security-scan] updating existing issue #${existingIssue}`);
    gh(["issue", "edit", String(existingIssue), "--body", summary]);
    gh([
      "issue",
      "comment",
      String(existingIssue),
      "--body",
      `Re-scanned on ${scannedAt} -- findings above refreshed.`,
    ]);
  } else {
    console.log("[security-scan] filing a new issue");
    gh([
      "issue",
      "create",
      "--title",
      "Security scan: high/critical npm vulnerabilities found",
      "--label",
      LABEL,
      "--body",
      summary,
    ]);
  }
}

function main() {
  const auditPath = process.argv[2];
  if (!auditPath) {
    console.error("Usage: node scripts/security-scan-report.mjs <audit-json-path>");
    process.exit(1);
  }

  // npm audit prints an empty file when every package is clean enough
  // that it finds nothing at all to report at --audit-level=high.
  const raw = readFileSync(auditPath, "utf8").trim();
  const audit = raw === "" ? {} : JSON.parse(raw);

  const findings = findHighSeverityVulnerabilities(audit);
  report(findings);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main();
}
