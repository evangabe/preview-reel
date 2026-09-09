// Entrypoint executed inside the Sandbox microVM. Written into the VM
// via `writeFiles` at run start (not baked into the snapshot), so runner
// logic changes never require a re-snapshot. Not implemented.
//
// Runs explore() then record(), per the demo spec and step budget.
export {};
