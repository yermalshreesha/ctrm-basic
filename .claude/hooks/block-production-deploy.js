'use strict';

const { readHookInput, deny, ask } = require('./lib/hookUtil');

// The public deploy hook: in this project's design, only ctrm-production has
// one at all (staging deploys natively via Render's own checksPass trigger),
// so any match here is inherently a production deploy -- no service name to
// check for.
const DEPLOY_HOOK_RE = /api\.render\.com\/deploy\/srv-/i;

// GitHub's pending-deployment-review endpoint, approving or rejecting the
// production Environment's required-reviewer gate.
const PENDING_DEPLOYMENTS_RE = /pending_deployments/i;
const APPROVAL_STATE_RE = /\b(approved|rejected)\b/i;

// Render's CLI, and its authenticated management API -- a second surface
// (besides the public deploy hook) that can deploy or roll back a service.
const RENDER_CLI_RE = /\brender\s+(deploys?|rollback)\b/i;
const RENDER_API_ACTION_RE = /api\.render\.com\/v1\/services\/[\w-]+\/(deploys?|rollback)/i;

const PRODUCTION_SERVICE_RE = /ctrm-production/i;

function main() {
  const input = readHookInput();
  if (input.tool_name !== 'Bash' && input.tool_name !== 'PowerShell') return;

  const command = input.tool_input && input.tool_input.command;
  if (!command) return;

  if (DEPLOY_HOOK_RE.test(command)) {
    deny(
      `Blocked: "${command}" targets the production deploy hook URL. Triggering a production deploy is reserved ` +
        'for a human -- the normal way to ship a change is still to merge to main and let the pipeline (staging ' +
        'auto-deploy, then the approval-gated production job) handle it. If production genuinely needs a manual ' +
        "deploy right now, ask the user to run it themselves.",
    );
    return;
  }

  if (PENDING_DEPLOYMENTS_RE.test(command) && APPROVAL_STATE_RE.test(command)) {
    deny(
      `Blocked: "${command}" looks like it approves or rejects a pending deployment review on GitHub. The ` +
        "production Environment's required-reviewer gate exists so a human decides when production actually " +
        'deploys -- Claude must never approve or reject it. Ask the user to review and approve it themselves in ' +
        "GitHub's UI (or via gh, from their own terminal).",
    );
    return;
  }

  if (RENDER_CLI_RE.test(command) || RENDER_API_ACTION_RE.test(command)) {
    if (PRODUCTION_SERVICE_RE.test(command)) {
      deny(
        `Blocked: "${command}" looks like a Render CLI or API call that deploys or rolls back ctrm-production ` +
          'directly. This is the same production-deploy/rollback action the deploy-hook check blocks, just ' +
          "through a different surface (Render's authenticated API/CLI instead of the public deploy hook) -- a " +
          'human must trigger it. Ask the user to run it themselves, or use the normal pipeline instead.',
      );
      return;
    }
    ask(
      `"${command}" looks like a Render CLI or API call that deploys or rolls back a service, but it doesn't ` +
        "clearly name ctrm-production. If this targets staging (or something else), it's fine; if it's " +
        "production referenced by a raw service ID, it must not run. Confirm which service this targets before " +
        'it runs.',
    );
    return;
  }
}

main();
