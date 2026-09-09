// Run record read/write. Owns the (repo, prNumber) in-progress/completed
// lookups (R-1.5, R-2.10) and the Workflow runId <-> run record mapping.
// Append-only per-stage event records, never an overwritten status blob
// (R-6.4). Not implemented.
export {};
