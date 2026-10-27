// Builds a ready-to-run desktop folder (and a zip) for one platform without needing that platform's tools.
// Usage: node desktop/pack.mjs win32|linux [arch]
import { downloadArtifact } from "@electron/get";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const platform = process.argv[2] || "win32";
const arch = process.argv[3] || "x64";
const version = JSON.parse(readFileSync(path.join(root, "node_modules/electron/package.json"), "utf8")).version;
const name = `BOX-BOX-${platform}-${arch}`;
const out = path.join(root, "release", name);

if (!existsSync(path.join(root, "dist", "index.html"))) execFileSync("npx", ["vite", "build"], { cwd: root, stdio: "inherit" });
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const zip = await downloadArtifact({ version, platform, arch, artifactName: "electron" });
execFileSync("python3", ["-c", "import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", zip, out]);
const app = path.join(out, "resources", "app");
mkdirSync(app, { recursive: true });
cpSync(path.join(root, "dist"), path.join(app, "dist"), { recursive: true });
cpSync(path.join(root, "desktop"), path.join(app, "desktop"), { recursive: true });
rmSync(path.join(app, "desktop", "pack.mjs"));
writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "box-box", version: "0.1.0", main: "desktop/main.cjs" }, null, 2));
const exe = platform === "win32" ? "electron.exe" : "electron";
const target = platform === "win32" ? "BOX BOX.exe" : "box-box";
renameSync(path.join(out, exe), path.join(out, target));
if (platform === "linux") writeFileSync(path.join(out, "run.sh"), '#!/bin/sh\ncd "$(dirname "$0")"\nexec ./box-box --no-sandbox "$@"\n', { mode: 0o755 });
execFileSync("python3", ["-c", "import shutil,sys;shutil.make_archive(sys.argv[1],'zip',sys.argv[2],sys.argv[3])", path.join(root, "release", name), path.join(root, "release"), name]);
console.log("built", path.join(root, "release", name + ".zip"));
