'use strict';

const { readHookInput, deny, isTrackedAtHead } = require('./lib/hookUtil');

function isMigrationFile(normalizedPath) {
  return (
    normalizedPath.includes('backend/prisma/migrations/') &&
    normalizedPath.endsWith('/migration.sql')
  );
}

function main() {
  const input = readHookInput();
  if (input.tool_name !== 'Edit' && input.tool_name !== 'Write') return;

  const filePath = input.tool_input && input.tool_input.file_path;
  if (!filePath) return;

  const normalized = filePath.replace(/\\/g, '/');
  if (!isMigrationFile(normalized)) return;

  if (!isTrackedAtHead(filePath)) return; // uncommitted new migration: still editable

  deny(
    `Blocked: ${filePath} is a committed migration. Editing a migration that's already in git history ` +
      "desyncs the database's migration history from the migrations folder -- anyone (including CI) who " +
      're-applies migrations from scratch gets a different result than this database already has. To fix a ' +
      'mistake in it, create a new migration that corrects it instead (edit schema.prisma and run ' +
      'npm run db:migrate, or hand-write a new timestamped migration folder). If this migration genuinely ' +
      'needs to be edited in place, say so and get the user\'s agreement first.',
  );
}

main();
