// Bakes Chrome, ffmpeg, agent-browser, and webreel into a Vercel Sandbox
// snapshot (R-3.1, R-3.2) so a run never pays cold-install time. Ends
// with a smoke recording (2-step config -> mp4) so a broken snapshot
// fails at build time, not mid-demo. Not implemented.
export {};
