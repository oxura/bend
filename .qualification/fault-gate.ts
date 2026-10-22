import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as lib from "../gates/_lib.ts";

// Fork-only smoke: expose the existing shard builder and judge unchanged.
const root = process.cwd();
const results = path.join(root, ".qualification", "results");
Bun.plugin({
  name: "fatal-signal-gate-qualification",
  setup(build) {
    build.onLoad({ filter: /\/gates\/test\.ts$/ }, async ({ path: file }) => ({
      contents: await Bun.file(file).text()
        + "\nexport { test_read, shard_script, shard_parse, test_judge };\n",
      loader: "ts",
      resolveDir: path.dirname(file),
    }));
  },
});
// The loader must register before this import exposes the private probe API.
const gate = await import(path.join(root, "gates", "test.ts"));
const test = gate.test_read("io", "stack_fault_trap.bend");
assert.equal(process.env.GITHUB_ACTIONS, "true",
  "The original shard cleanup must run only on the isolated CI runner");
fs.mkdirSync(path.join(results, "home"), { recursive: true });
const pack = Bun.spawnSync(["tar", "-czf", "-", "--exclude=bend2/docs", "bend2", "tests"],
  { cwd: root, stdout: "pipe", stderr: "pipe" });
assert.equal(pack.exitCode, 0, pack.stderr.toString());
const run = await lib.exec("/bin/bash", ["-c", gate.shard_script([test], Date.now())],
  pack.stdout, 120_000, { HOME: path.join(results, "home") }, root);
fs.writeFileSync(path.join(results, "shard.stdout.txt"), run.out);
fs.writeFileSync(path.join(results, "shard.stderr.txt"), run.err);
assert.equal(run.code, 0, run.err);
const observed = gate.shard_parse([test], run.out).get(test.name);
const failures = gate.test_judge(test, observed ?? {});
const native = /@@B4 c io_stack_fault_trap\n[\s\S]*?@@B4 exit (\d+)/.exec(run.out);
assert(native, "missing actual native shard result");
assert(["138", "139"].includes(native[1]), "native fault must retain SIGBUS/SIGSEGV");
const report = { platform: process.platform, arch: process.arch,
  test: test.name, nativeShellExit: native[1], observed, failures };
fs.writeFileSync(path.join(results, "qualification.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(failures, []);
