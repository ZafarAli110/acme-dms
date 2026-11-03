// Stops `bun run dev` before it starts on packages that are not installed. Switching to a branch that adds a package
// (lab/09-export-after adds pg-query-stream) leaves node_modules behind; the service would then start, crash on the
// missing import, and show only as "Unhealthy" in the dashboard.
//
//   bun scripts/check-install.ts
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

interface PackageJson {
  workspaces?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const root = join(import.meta.dir, "..");
const rootPackage = (await Bun.file(join(root, "package.json")).json()) as PackageJson;

const packageDirs = [root];
for (const pattern of rootPackage.workspaces ?? []) {
  for (const file of new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: root })) {
    packageDirs.push(join(root, dirname(file)));
  }
}

const missing: string[] = [];
for (const dir of packageDirs) {
  const manifest = (await Bun.file(join(dir, "package.json")).json()) as PackageJson;
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (!existsSync(join(dir, "node_modules", name)) && !existsSync(join(root, "node_modules", name))) {
      missing.push(`${name} (${dir === root ? "root" : dir.slice(root.length + 1)})`);
    }
  }
}

if (missing.length) {
  console.error(
    [
      "",
      `Packages this branch needs are not installed: ${missing.join(", ")}.`,
      "Run `bun install` (it is quick when most are there), then start again.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
