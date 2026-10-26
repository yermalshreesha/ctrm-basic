'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function readHookInput() {
  const raw = fs.readFileSync(0, 'utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function emitDecision(decision, reason) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

function deny(reason) {
  emitDecision('deny', reason);
}

function ask(reason) {
  emitDecision('ask', reason);
}

function repoRoot() {
  // this file lives at <repo root>/.claude/hooks/lib/hookUtil.js
  return path.resolve(__dirname, '..', '..', '..');
}

function toGitPath(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot(), filePath);
  const rel = path.relative(repoRoot(), abs);
  return rel.split(path.sep).join('/');
}

function isTrackedAtHead(filePath) {
  const gitPath = toGitPath(filePath);
  try {
    execFileSync('git', ['cat-file', '-e', `HEAD:${gitPath}`], {
      cwd: repoRoot(),
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function isCleanAtHead(filePath) {
  if (!isTrackedAtHead(filePath)) return false;
  const gitPath = toGitPath(filePath);
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', gitPath], {
      cwd: repoRoot(),
      stdio: 'ignore',
    });
    return true; // exit 0 => no diff from HEAD => clean
  } catch {
    return false; // exit 1 => dirty, or git itself failed
  }
}

function currentBranch() {
  try {
    const out = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoRoot(),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return out.trim();
  } catch {
    return '';
  }
}

module.exports = {
  readHookInput,
  deny,
  ask,
  repoRoot,
  toGitPath,
  isTrackedAtHead,
  isCleanAtHead,
  currentBranch,
};
