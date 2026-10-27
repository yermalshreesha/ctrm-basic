'use strict';

const { readHookInput, deny, ask } = require('./lib/hookUtil');

const STOP_REMOVE_RE =
  /\bdocker(?:-|\s+)compose\s+(?:down|stop|kill|rm)\b|\bdocker\s+(?:stop|kill|rm)\b|\bdocker\s+container\s+(?:stop|rm)\b|\bdocker\s+volume\s+rm\b|\bdocker\s+system\s+prune\b|\bdb:down\b/i;

const DEV_SERVER_RE = /\bnpm\s+run\s+dev\b|\bnpm\s+start\b|\bvite\b|\bnodemon\b|\bts-node-dev\b|\bconcurrently\b/i;

const BACKGROUNDING_RE =
  /(?<![&>])&(?![&>])|\bnohup\b|\bdisown\b|\bstart\s+\/b\b|\bStart-Process\b/i;

const RESET_RE = /\bprisma\s+migrate\s+reset\b|\bdb:test:reset\b/i;

const PNPM_RE = /\bpnpm\b/i;

function main() {
  const input = readHookInput();
  if (input.tool_name !== 'Bash' && input.tool_name !== 'PowerShell') return;

  const command = input.tool_input && input.tool_input.command;
  if (!command) return;

  if (PNPM_RE.test(command)) {
    deny(
      `Blocked: "${command}" runs pnpm. This project uses npm only (package-lock.json) -- use the equivalent ` +
        'npm command instead.',
    );
    return;
  }

  if (STOP_REMOVE_RE.test(command)) {
    deny(
      `Blocked: "${command}" stops or removes the project's Postgres container. It should keep running for ` +
        "the rest of the session -- if it genuinely needs to be stopped or removed, ask the user to run " +
        '"npm run db:down" (or "docker compose down") themselves.',
    );
    return;
  }

  const backgrounded = input.tool_input.run_in_background === true || BACKGROUNDING_RE.test(command);
  if (backgrounded && DEV_SERVER_RE.test(command)) {
    deny(
      "Blocked: starting a dev server in the background leaves a process the user can't see that outlives " +
        'this command. Run "npm run dev" in the foreground so its output stays visible and it stops when the ' +
        'tool call does, or ask the user to start it themselves in their own terminal.',
    );
    return;
  }

  if (RESET_RE.test(command)) {
    ask(
      `"${command}" drops and recreates a database from scratch. If this is db:test:reset against ctrm_test, ` +
        "that's expected and safe; if it's a bare \"prisma migrate reset\" it may target ctrm_dev instead. " +
        'Confirm this is the right database before it runs.',
    );
    return;
  }
}

main();
