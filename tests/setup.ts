import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Every test file writes evidence to its own temp runtime dir.
process.env.ABR_RUNTIME_DIR = mkdtempSync(path.join(os.tmpdir(), "abr-test-"));
