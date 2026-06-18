import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const scriptPath = resolve("scripts/check-version.mjs");

describe("version check script", () => {
  it("passes when package, lockfile, and manifest versions match", () => {
    const cwd = createVersionFixture("0.1.0", "0.1.0", "0.1.0", "0.1.0");

    expect(execFileSync(process.execPath, [scriptPath], { cwd, encoding: "utf8" })).toContain("Version 0.1.0");
  });

  it("fails when versions drift", () => {
    const cwd = createVersionFixture("0.1.0", "0.1.0", "0.2.0", "0.1.0");
    const result = runVersionCheck(cwd);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must match");
  });

  it("fails invalid Chrome extension versions", () => {
    const cwd = createVersionFixture("01.0.0", "01.0.0", "01.0.0", "01.0.0");
    const result = runVersionCheck(cwd);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must be one to four");
  });
});

function createVersionFixture(
  packageVersion: string,
  lockVersion: string,
  manifestVersion: string,
  lockPackageVersion: string
): string {
  const cwd = mkdtempSync(join(tmpdir(), "mandarin-lens-version-"));
  writeJson(join(cwd, "package.json"), { version: packageVersion });
  writeJson(join(cwd, "package-lock.json"), {
    version: lockVersion,
    packages: {
      "": {
        version: lockPackageVersion
      }
    }
  });
  writeJson(join(cwd, "public/manifest.json"), { version: manifestVersion });
  return cwd;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value), "utf8");
}

function runVersionCheck(cwd: string): { status: number | null; stderr: string } {
  const result = spawnSync(process.execPath, [scriptPath], { cwd, encoding: "utf8" });
  return {
    status: result.status,
    stderr: result.stderr
  };
}
