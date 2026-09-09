// Durable orchestration for the record-demo pipeline (docs/spec.md §6).
// One Workflow step per stage so a multi-minute run survives a function
// timeout, crash, or redeploy, and can be retried per-step:
//
//   1. tag check       — deterministic, no model call on no-match
//   2. scope the demo  — AI Gateway call -> zod-validated demo spec
//   3. post PR comment — state: in_progress
//   4. sandbox run      — explore (agent-browser) -> record (webreel)
//   5. upload to Blob   — video + config + poster
//   6. update PR comment — state: done | failed
//
// Build order step 2 (webhook -> Workflow) and step 1 (explore -> record)
// land the pieces this file wires together. Not implemented yet.
export {};
