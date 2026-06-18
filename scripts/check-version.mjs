import { readFileSync } from "node:fs";

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const manifest = readJson("public/manifest.json");

const packageVersion = packageJson.version;
const lockVersion = packageLock.version;
const lockPackageVersion = packageLock.packages?.[""]?.version;
const manifestVersion = manifest.version;

const errors = [
  requireString("package.json version", packageVersion),
  requireString("package-lock.json version", lockVersion),
  requireString("package-lock.json root package version", lockPackageVersion),
  requireString("public/manifest.json version", manifestVersion),
  packageVersion === manifestVersion
    ? undefined
    : `package.json version (${packageVersion}) must match public/manifest.json version (${manifestVersion}).`,
  packageVersion === lockVersion
    ? undefined
    : `package.json version (${packageVersion}) must match package-lock.json version (${lockVersion}).`,
  packageVersion === lockPackageVersion
    ? undefined
    : `package.json version (${packageVersion}) must match package-lock.json packages[""].version (${lockPackageVersion}).`,
  isChromeVersion(manifestVersion)
    ? undefined
    : `public/manifest.json version (${manifestVersion}) must be one to four dot-separated integers from 0 to 65535, with no leading zeroes.`
].filter(Boolean);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Version ${packageVersion} is in sync.`);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function requireString(label, value) {
  return typeof value === "string" && value.length > 0 ? undefined : `${label} must be a non-empty string.`;
}

function isChromeVersion(value) {
  if (typeof value !== "string") {
    return false;
  }

  const parts = value.split(".");
  if (parts.length < 1 || parts.length > 4) {
    return false;
  }

  const numbers = parts.map((part) => {
    if (!/^(0|[1-9]\d*)$/.test(part)) {
      return undefined;
    }

    const parsed = Number(part);
    return parsed >= 0 && parsed <= 65535 ? parsed : undefined;
  });

  return numbers.every((number) => number !== undefined) && numbers.some((number) => number !== 0);
}
