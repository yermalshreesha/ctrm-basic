'use strict';

const { readHookInput, deny, isCleanAtHead, currentBranch } = require('./lib/hookUtil');

function isTestFile(normalizedPath) {
  return (
    normalizedPath.includes('backend/test/') ||
    normalizedPath.includes('frontend/test/') ||
    /\.test\.tsx?$/.test(normalizedPath)
  );
}

function main() {
  const input = readHookInput();
  if (input.tool_name !== 'Edit' && input.tool_name !== 'Write') return;

  const filePath = input.tool_input && input.tool_input.file_path;
  if (!filePath) return;

  const normalized = filePath.replace(/\\/g, '/');
  if (!isTestFile(normalized)) return;

  const branch = currentBranch();
  if (!branch.startsWith('fix/')) return;

  if (!isCleanAtHead(filePath)) return; // untracked, or dirty: still being written

  deny(
    `Blocked: ${filePath} is a committed test file on the "${branch}" branch, with no uncommitted changes to ` +
      'it -- it looks like the failing test is already captured in a commit. Fix the application code the ' +
      "test caught, not the test itself. If the test genuinely needs changing, say so and get the user's " +
      'agreement first. A new failing test for this fix belongs in a new file (e.g. under ' +
      'backend/test/regressions/ or frontend/test/regressions/), not an edit to an existing test file.',
  );
}

main();
