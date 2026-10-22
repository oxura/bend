import { mkdir } from "node:fs/promises";
const dir = import.meta.dirname;
await mkdir(dir + "/results/review8", { recursive: true });
for (const mode of ["restore", "close-enter", "close-exit"]) {
  const p = Bun.spawn([dir + "/cocoa-review8", mode], { stdout: "pipe", stderr: "pipe" });
  const stdout = new Response(p.stdout).text();
  const stderr = new Response(p.stderr).text();
  const timer = setTimeout(() => p.kill("SIGKILL"), 45000);
  const exit = await p.exited;
  clearTimeout(timer);
  const report = {
    mode, exit, stdout: await stdout, stderr: await stderr,
    platform: process.platform, arch: process.arch,
    limits: ["The real Cocoa Did callback is held for seven seconds, then forwarded unchanged; this is a controlled notification-boundary delay, not a naturally stalled OS transition.", "The observer holds window/view references; this checks delegate-detach ordering, real callback progress, timeout and state restoration, not an ASan/UAF reproduction."],
  };
  await Bun.write(dir + "/results/review8/" + mode + ".json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (exit !== 0) throw Error("Native Cocoa sequencing failed: " + mode);
}
