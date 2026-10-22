import { mkdir } from "node:fs/promises";

type Bounds = { Width: number; Height: number };
type WindowInfo = { kCGWindowBounds: Bounds; kCGWindowIsOnscreen?: boolean };
type Metadata = { display: Bounds; windows: WindowInfo[] };
type Observation = { stage: string; exit: number; error: string; metadata: Metadata | null; screenshotExit: number; screenshotError: string };
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function bounds(value: unknown): value is Bounds {
  return record(value) && typeof value.Width === "number" && typeof value.Height === "number";
}
function windowInfo(value: unknown): value is WindowInfo {
  return record(value) && bounds(value.kCGWindowBounds)
    && (value.kCGWindowIsOnscreen === undefined || typeof value.kCGWindowIsOnscreen === "boolean");
}
function parseMetadata(text: string): Metadata {
  const value: unknown = JSON.parse(text);
  if (!record(value) || !bounds(value.display) || !Array.isArray(value.windows) || !value.windows.every(windowInfo)) {
    throw Error("Unexpected CoreGraphics window-server metadata");
  }
  return { display: value.display, windows: value.windows };
}
const dir = import.meta.dirname;
const mode = process.env.BEND_COCOA_EDGE_MODE ?? "normal";
const resultDir = dir + "/results/" + mode;
await mkdir(resultDir, { recursive: true });
const p = Bun.spawn([dir + "/cocoa-probe", "--gpu", "off", "--threads", "1"], {
  stdout: "pipe", stderr: "pipe",
  env: { ...process.env, BEND_COCOA_EDGE_MODE: mode, DYLD_INSERT_LIBRARIES: dir + "/cocoa-edge.dylib" },
});
const shots: Promise<unknown>[] = [];
const observations: Observation[] = [];
async function observe(stage: string) {
  await Bun.sleep(1200);
  const o = Bun.spawn([dir + "/observe", String(p.pid)], { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(o.stdout).text();
  const error = await new Response(o.stderr).text();
  const exit = await o.exited;
  await Bun.write(resultDir + "/" + stage + ".json", text);
  const image = resultDir + "/" + stage + ".png";
  const s = Bun.spawn(["/usr/sbin/screencapture", "-x", image], { stdout: "pipe", stderr: "pipe" });
  observations.push({ stage, exit, error, metadata: text ? parseMetadata(text) : null, screenshotExit: await s.exited, screenshotError: await new Response(s.stderr).text() });
}
let stdout = "";
let pending = "";
const reading = (async () => {
  const decoder = new TextDecoder();
  for await (const chunk of p.stdout) {
    const text = decoder.decode(chunk, { stream: true });
    process.stdout.write(text);
    stdout += text;
    pending += text;
    const lines = pending.split("\n");
    pending = lines.pop()!;
    for (const line of lines) if (/^(ENTER:FIRST|EXIT:FIRST|EXIT:RETRY|ENTER:SECOND)$/.test(line)) shots.push(observe(line.replaceAll(":", "-")));
  }
})();
const stderrPromise = new Response(p.stderr).text();
const timeout = setTimeout(() => p.kill("SIGKILL"), 90000);
const exit = await p.exited;
clearTimeout(timeout);
await reading;
const stderr = await stderrPromise;
await Promise.all(shots);
const report = {
  mode, exit, stdout, stderr, observations,
  scope: "Actual Cocoa app, Metal renderer and independent CoreGraphics window-server observations",
  limits: ["Failure delegates and the missing toggle are controlled OS-boundary injections, not unforced OS failures", "Scale mode changes the reported backing factor and invokes the real backing-change callback; no physical Retina/display migration"],
};
await Bun.write(resultDir + "/report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (exit !== 0 || (stdout.match(/FULL:OK/g) ?? []).length !== 4 || !stdout.includes("CLOSED")) throw Error("Native Cocoa lifecycle failed; report preserves the actual result");
if (mode !== "normal" && !stdout.includes("EDGE:" + mode)) throw Error("Requested native boundary was not exercised");
if (mode === "scale" && (!stdout.includes("EDGE:scale=2 logical=97x65 drawable=97x65") || !stdout.includes("EDGE:scale=1 logical=97x65 drawable=97x65"))) throw Error("Both backing-scale directions were not exercised");
for (const o of observations) {
  const metadata = o.metadata;
  if (o.exit !== 0 || !metadata || o.screenshotExit !== 0) throw Error("Native surface observation failed: " + o.stage);
  const windows = metadata.windows;
  const full = windows.some(w => w.kCGWindowIsOnscreen && w.kCGWindowBounds.Width === metadata.display.Width && w.kCGWindowBounds.Height === metadata.display.Height);
  const shouldBeFull = o.stage === "ENTER-SECOND"
    || (o.stage === "ENTER-FIRST" && mode !== "fail-enter" && mode !== "ignore")
    || (o.stage === "EXIT-FIRST" && mode === "fail-exit");
  if (shouldBeFull && !full) throw Error("No actual fullscreen window observed: " + o.stage);
  if (!shouldBeFull && !windows.some(w => w.kCGWindowIsOnscreen && w.kCGWindowBounds.Width === 97)) throw Error("Original windowed width not restored: " + o.stage);
}
if (observations.length !== 4) throw Error("Missing native stage observations");
