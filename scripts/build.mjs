// Static build: syntax-check every module, then copy public/ and src/ into dist/.
import { mkdir, cp, rm, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const sources = (await readdir(resolve(root, "src"), { recursive: true })).filter((f) => f.endsWith(".js"));
for (const f of [...sources.map((s) => "src/" + s), "server.mjs"]) execFileSync(process.execPath, ["--check", resolve(root, f)]);
await rm(resolve(root, "dist"), { recursive: true, force: true });
await mkdir(resolve(root, "dist"), { recursive: true });
await cp(resolve(root, "public"), resolve(root, "dist"), { recursive: true });
await cp(resolve(root, "src"), resolve(root, "dist/src"), { recursive: true });
console.log(`Static build in dist/ (${sources.length} modules checked)`);
