import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const executeFile = promisify(execFile);

const requiredPackages = new Map([
  ["apps/web/package.json", "@mrb/web"],
  ["apps/api/package.json", "@mrb/api"],
  ["packages/time/package.json", "@mrb/time"],
  ["packages/contracts/package.json", "@mrb/contracts"],
  ["packages/config/package.json", "@mrb/config"]
]);

export class RepositoryPolicyError extends Error {
  constructor(violations) {
    super("Repository policy violations");
    this.name = "RepositoryPolicyError";
    this.violations = violations;
  }
}

async function readJson(root, path, violations) {
  try {
    const contents = await readFile(join(root, path), "utf8");

    try {
      return JSON.parse(contents);
    } catch {
      violations.push(`${path} must contain valid JSON`);
      return undefined;
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      violations.push(`${path} is required`);
      return undefined;
    }

    throw error;
  }
}

async function readWorkspace(root, violations) {
  try {
    return await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      violations.push("pnpm-workspace.yaml is required");
      return undefined;
    }

    throw error;
  }
}

function verifyRootManifest(manifest, violations) {
  if (!manifest) return;

  if (manifest.engines?.node !== "24.18.x") {
    violations.push("package.json must require Node 24.18.x");
  }

  if (manifest.packageManager !== "pnpm@11.17.0") {
    violations.push("package.json must declare pnpm@11.17.0");
  }

  if (manifest.scripts?.test !== "pnpm test:unit") {
    violations.push("package.json must map test to pnpm test:unit");
  }
}

function verifyWorkspacePackages(workspace, violations) {
  if (!workspace) return;

  if (!hasWorkspacePackage(workspace, "apps/*")) {
    violations.push("pnpm-workspace.yaml must include apps/*");
  }

  if (!hasWorkspacePackage(workspace, "packages/*")) {
    violations.push("pnpm-workspace.yaml must include packages/*");
  }
}

function hasWorkspacePackage(workspace, packageGlob) {
  return workspacePackageEntries(workspace).some(
    (entry) => unquoteWorkspaceEntry(entry) === packageGlob
  );
}

function workspacePackageEntries(workspace) {
  const lines = workspace.split(/\r?\n/);
  const packagesLine = lines.findIndex((line) =>
    /^packages:\s*(?:#.*)?$/.test(line)
  );

  if (packagesLine === -1) return [];

  const entries = [];
  let entryIndentation;

  for (const line of lines.slice(packagesLine + 1)) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    if (!/^[\t ]/.test(line)) break;

    const entry = /^([\t ]+)-\s*(.*?)\s*(?:#.*)?$/.exec(line);

    if (!entry) {
      if (entryIndentation === undefined) return [];
      continue;
    }

    if (entryIndentation === undefined) {
      entryIndentation = entry[1];
    }

    if (entry[1] === entryIndentation) {
      entries.push(entry[2]);
    }
  }

  return entries;
}

function unquoteWorkspaceEntry(entry) {
  const quotedEntry = /^(["'])(.*)\1$/.exec(entry);

  return quotedEntry ? quotedEntry[2] : entry;
}

function verifyPackageManifest(path, name, manifest, violations) {
  if (!manifest) return;

  if (manifest.name !== name) {
    violations.push(`${path} must declare ${name}`);
  }

  if (manifest.private !== true) {
    violations.push(`${path} must remain private`);
  }

  if (manifest.type !== "module") {
    violations.push(`${path} must use ESM`);
  }
}

async function loadTrackedFiles(root) {
  const { stdout } = await executeFile("git", ["ls-files", "-z"], {
    cwd: root
  });

  return stdout.split("\0").filter(Boolean);
}

export async function verifyRepository(root, { trackedFiles } = {}) {
  const resolvedTrackedFiles = trackedFiles ?? (await loadTrackedFiles(root));
  void resolvedTrackedFiles;

  const violations = [];
  const rootManifest = await readJson(root, "package.json", violations);
  const workspace = await readWorkspace(root, violations);

  verifyRootManifest(rootManifest, violations);
  verifyWorkspacePackages(workspace, violations);

  for (const [path, name] of requiredPackages) {
    const manifest = await readJson(root, path, violations);
    verifyPackageManifest(path, name, manifest, violations);
  }

  if (violations.length > 0) {
    throw new RepositoryPolicyError(violations);
  }

  return { packageCount: requiredPackages.size };
}
