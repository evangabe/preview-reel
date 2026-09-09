import { Sandbox, type CommandFinished } from "@vercel/sandbox";

const AGENT_BROWSER_VERSION = "0.37.1";
const WEBREEL_VERSION = "0.1.4";
const BUILD_TIMEOUT_MS = 10 * 60 * 1_000;
const FFMPEG_URL =
  "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz";

async function output(command: CommandFinished): Promise<string> {
  return command.output("both");
}

async function run(
  sandbox: Sandbox,
  label: string,
  params: Parameters<Sandbox["runCommand"]>[0] & {
    cmd: string;
  },
): Promise<CommandFinished> {
  process.stdout.write(`\n[${label}]\n`);
  const command = await sandbox.runCommand({
    ...params,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (command.exitCode !== 0) {
    throw new Error(
      `${label} failed (${command.exitCode}): ${(await output(command)).trim()}`,
    );
  }
  return command;
}

function chromePathFromDoctor(raw: string): string {
  const doctor = JSON.parse(raw) as {
    checks: Array<{ id: string; message: string; status: string }>;
  };
  const check = doctor.checks.find((item) => item.id === "chrome.installed");
  const match = check?.message.match(/\sat (\/.+)$/);
  if (!check || check.status !== "pass" || !match) {
    throw new Error("agent-browser doctor did not report an installed Chrome");
  }
  return match[1];
}

const WEBREEL_FFMPEG_PATCH = `
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = execFileSync("npm", ["root", "--global"], { encoding: "utf8" }).trim();
const path = join(root, "webreel/node_modules/@webreel/core/dist/recorder.js");
let source = readFileSync(path, "utf8");
const replacements = [
  [
    "    ffmpegProcess = null;\\n",
    "    ffmpegProcess = null;\\n    ffmpegStderr = \\"\\";\\n",
  ],
  [
    "        this.ffmpegPath = await ensureFfmpeg();\\n",
    "        this.ffmpegPath = await ensureFfmpeg();\\n        this.ffmpegStderr = \\"\\";\\n",
  ],
  [
    "        const resolveDrain = () => {\\n",
    "        this.ffmpegProcess.stderr?.on(\\"data\\", (chunk) => { this.ffmpegStderr += chunk.toString(); });\\n        const resolveDrain = () => {\\n",
  ],
  [
    "            clearTimeout(killTimer);\\n            this.ffmpegProcess = null;\\n",
    "            clearTimeout(killTimer);\\n            this.ffmpegProcess = null;\\n            if (proc.exitCode !== 0) throw new Error(\\"ffmpeg exited \\" + proc.exitCode + \\": \\" + this.ffmpegStderr);\\n",
  ],
];
for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error("WebReel 0.1.4 recorder patch no longer applies");
  source = source.replace(before, after);
}
writeFileSync(path, source);

const chromePath = join(root, "webreel/node_modules/@webreel/core/dist/chrome.js");
let chromeSource = readFileSync(chromePath, "utf8");
const beginFrameFlag = "                \\"--enable-begin-frame-control\\",\\n";
if (!chromeSource.includes(beginFrameFlag)) throw new Error("WebReel 0.1.4 Chrome patch no longer applies");
chromeSource = chromeSource.replace(beginFrameFlag, "");
writeFileSync(chromePath, chromeSource);
`;

async function main() {
  let snapshotted = false;
  const sandbox = await Sandbox.create({
    image: "vercel/sandbox/universal:latest",
    timeout: BUILD_TIMEOUT_MS,
    persistent: false,
    region: "iad1",
    resources: { vcpus: 4 },
    tags: { purpose: "preview-reel-snapshot-build" },
  });
  process.stdout.write(`Created ${sandbox.name}\n`);

  try {
    await run(sandbox, "install CLIs", {
      cmd: "npm",
      args: [
        "install",
        "--global",
        `agent-browser@${AGENT_BROWSER_VERSION}`,
        `webreel@${WEBREEL_VERSION}`,
      ],
      sudo: true,
      timeoutMs: 2 * 60 * 1_000,
    });
    await sandbox.writeFiles([
      { path: "patch-webreel.mjs", content: WEBREEL_FFMPEG_PATCH },
    ]);
    await run(sandbox, "patch WebReel ffmpeg diagnostics", {
      cmd: "node",
      args: ["patch-webreel.mjs"],
      sudo: true,
      timeoutMs: 30_000,
    });

    await run(sandbox, "install static ffmpeg", {
      cmd: "bash",
      args: [
        "-lc",
        [
          `curl --fail --location '${FFMPEG_URL}' --output /tmp/ffmpeg.tar.xz`,
          "mkdir -p /tmp/ffmpeg-static",
          "tar -xJf /tmp/ffmpeg.tar.xz --strip-components=1 -C /tmp/ffmpeg-static",
          "install -m 0755 /tmp/ffmpeg-static/bin/ffmpeg /usr/local/bin/ffmpeg",
        ].join(" && "),
      ],
      sudo: true,
      timeoutMs: 3 * 60 * 1_000,
    });
    await run(sandbox, "smoke static ffmpeg", {
      cmd: "/usr/local/bin/ffmpeg",
      args: [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=320x240:d=0.2",
        "-c:v",
        "libx264",
        "-y",
        "/tmp/ffmpeg-smoke.mp4",
      ],
      timeoutMs: 30_000,
    });

    await run(sandbox, "install agent-browser Chrome and Linux dependencies", {
      cmd: "agent-browser",
      args: ["install", "--with-deps"],
      timeoutMs: 5 * 60 * 1_000,
    });

    const doctor = await sandbox.runCommand({
      cmd: "agent-browser",
      args: ["doctor", "--json"],
      timeoutMs: 60_000,
    });
    if (doctor.exitCode !== 0) {
      throw new Error(`agent-browser doctor failed: ${await output(doctor)}`);
    }
    const chromePath = chromePathFromDoctor(await doctor.stdout());
    process.stdout.write(`Shared Chrome: ${chromePath}\n`);

    const smokeConfig = {
      $schema: "https://webreel.dev/schema/v1.json",
      videos: {
        smoke: {
          url: "https://example.com",
          viewport: { width: 1280, height: 720 },
          output: "../smoke.mp4",
          thumbnail: { time: 0.5 },
          steps: [
            { action: "pause", ms: 3_000 },
            { action: "wait", text: "Example Domain", timeout: 10_000 },
          ],
        },
      },
    };
    await sandbox.writeFiles([
      {
        path: "smoke/config.json",
        content: `${JSON.stringify(smokeConfig, null, 2)}\n`,
      },
    ]);

    const smoke = await sandbox.runCommand({
      cmd: "webreel",
      args: ["record", "-c", "smoke/config.json", "--verbose"],
      env: { CHROME_PATH: chromePath, FFMPEG_PATH: "/usr/local/bin/ffmpeg" },
      stdout: process.stdout,
      stderr: process.stderr,
      timeoutMs: 3 * 60 * 1_000,
    });
    if (smoke.exitCode !== 0) {
      throw new Error(`WebReel smoke failed: ${(await output(smoke)).trim()}`);
    }
    const smokeOutput = await output(smoke);
    const sharedChrome = !smokeOutput.includes(
      "Downloading chrome-headless-shell",
    );

    const smokeVideo = await sandbox.readFileToBuffer({
      path: "smoke/smoke.mp4",
    });
    if (!smokeVideo || smokeVideo.byteLength < 10_000) {
      throw new Error(
        `Snapshot smoke video missing or too small: ${smokeVideo?.byteLength ?? 0} bytes`,
      );
    }
    process.stdout.write(`Smoke video: ${smokeVideo.byteLength} bytes\n`);

    const snapshot = await sandbox.snapshot({ expiration: 0 });
    snapshotted = true;
    process.stdout.write(
      `${JSON.stringify({
        snapshotId: snapshot.snapshotId,
        regions: snapshot.regions,
        sharedChrome,
      })}\n`,
    );
  } finally {
    if (!snapshotted) {
      await sandbox.stop().catch(() => undefined);
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
