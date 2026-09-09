// Boot-time environment validation (R-CFG.1). A missing secret should
// fail the deploy, not the third stage of a run. Not implemented yet —
// wire this into app startup once the env list below is actually
// consumed by trigger/scope/sandbox/storage code.
//
// VERCEL_WEBHOOK_SECRET   shown once when the team webhook is created
// PREVIEW_REEL_REPOS      comma-separated allowlist, e.g. me/preview-reel-target
// GITHUB_TOKEN            fine-grained PAT: PRs read, Issues write
// VERCEL_PROTECTION_BYPASS per target project
// DEMO_LOGIN_TOKEN        long-lived secret; target app trades it for a session
// AI_GATEWAY_API_KEY
// BLOB_READ_WRITE_TOKEN
// VERCEL_OIDC_TOKEN       or team token, for Sandbox provisioning
export {};
