/** Whitelist release files. Never ship account databases, SSH keys or checkout metadata. */
import { mkdir, cp, writeFile, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
const stage = await mkdtemp(path.join(os.tmpdir(), "horserace-release-"));
try {
  await mkdir("review/multiplayer", { recursive: true });
  for (const file of ["site", "race-core.js", "track.js", "betting.js", "powers.js", "progression.js", "TRAINING.md", "BETTING.md", "POWERS.md", "PROGRESSION.md", "deploy"])
    await cp(file, path.join(stage, file), { recursive: true });
  await mkdir(path.join(stage, "server"));
  for (const file of ["game.js", "http.js", "start.js", "race-simulation.js"])
    await cp("server/" + file, path.join(stage, "server", file));
  await writeFile(
    path.join(stage, "package.json"),
    JSON.stringify({
      name: "streakchat-horserace",
      private: true,
      type: "module",
      engines: { node: ">=24.13.0" },
      scripts: { start: "node server/start.js" },
    }) + "\n",
  );
  execFileSync("tar", [
    "-czf",
    path.resolve("review/multiplayer/horserace-release.tar.gz"),
    "-C",
    stage,
    ".",
  ]);
  console.log(
    "Created review/multiplayer/horserace-release.tar.gz (application only; data stays separate).",
  );
} finally {
  await rm(stage, { recursive: true, force: true });
}
