// Not `@testing-library/jest-dom/vitest`: that entry point imports its own
// `expect` from "vitest", which — because the backend and frontend
// workspaces pin different Vitest majors (see plan.md's "known tooling
// gap") — resolves to the *root* node_modules' hoisted `vitest` (the
// backend's v2), not the nested `frontend/node_modules/vitest` (v5) this
// file and every test file actually run under. Extending the wrong
// `expect` singleton silently no-ops, so every jest-dom matcher
// (toBeInTheDocument, toHaveValue, ...) reports "Invalid Chai property".
// Importing `expect` here ourselves resolves it the same way a test file
// under `frontend/test/` does, and extending that instance directly with
// the framework-agnostic `./matchers` entry point sidesteps jest-dom's
// own (mis-resolving) `vitest` import.
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

// vitest.config.ts has `globals: false`, so React Testing Library's
// automatic-cleanup detection (which looks for a global test-framework
// afterEach) never fires — without this, unmounted trees from a previous
// test in the same file stay in `document.body`, so a later test's
// `getByRole`/`getByText` can match leftover elements from an earlier one.
afterEach(() => {
  cleanup();
});
