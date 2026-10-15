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
const p = Bun.spawn([dir + "/cocoa-probe", "--gpu", "off", "--threads", "1"], { stdout: "pipe", stderr: "pipe" });
const shots: Promise<unknown>[] = [];
const observations: Observation[] = [];
async function observe(stage: string) {
  await Bun.sleep(1200);
  const o = Bun.spawn([dir + "/observe", String(p.pid)], { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(o.stdout).text();
  const error = await new Response(o.stderr).text();
  const exit = await o.exited;
  await Bun.write(dir + "/results/" + stage + ".json", text);
  const image = dir + "/results/" + stage + ".png";
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
    for (const line of lines) if (/^(ENTER:FIRST|EXIT:FIRST|ENTER:SECOND)$/.test(line)) shots.push(observe(line.replaceAll(":", "-")));
  }
})();
const stderrPromise = new Response(p.stderr).text();
const timeout = setTimeout(() => p.kill("SIGKILL"), 90000);
const exit = await p.exited;
clearTimeout(timeout);
await reading;
const stderr = await stderrPromise;
await Promise.all(shots);
const report = { exit, stdout, stderr, observations, scope: "Actual Cocoa native consumer and separate CoreGraphics window-server observations; no callbacks or renderer mocked", limits: ["No forced native failure notification", "No induced Retina/display migration", "No ignored-toggle simulation"] };
await Bun.write(dir + "/results/report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (exit !== 0 || (stdout.match(/FULL:OK/g) ?? []).length !== 3 || !stdout.includes("CLOSED")) throw Error("Native Cocoa lifecycle failed; report preserves the actual result");
for (const o of observations) {
  const metadata = o.metadata;
  if (o.exit !== 0 || !metadata) throw Error("Window-server observation failed: " + o.stage);
  const windows = metadata.windows;
  const full = windows.some(w => w.kCGWindowIsOnscreen && w.kCGWindowBounds.Width === metadata.display.Width && w.kCGWindowBounds.Height === metadata.display.Height);
  if (o.stage.startsWith("ENTER") && !full) throw Error("No actual fullscreen window observed: " + o.stage);
  if (o.stage.startsWith("EXIT") && !windows.some(w => w.kCGWindowIsOnscreen && w.kCGWindowBounds.Width === 97)) throw Error("Original windowed width not restored");
}
if (observations.length !== 3) throw Error("Missing native stage observations");
