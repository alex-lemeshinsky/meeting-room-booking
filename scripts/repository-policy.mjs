import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, posix } from "node:path";
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

async function listFiles(root, directory) {
  let entries;

  try {
    entries = await readdir(join(root, directory), { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const files = [];

  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files.sort();
}

async function verifySourceBoundaries(root, violations) {
  const webFiles = await listFiles(root, "apps/web/src");

  for (const path of webFiles.filter((file) =>
    /\.(?:[cm]?[jt]sx?)$/.test(file)
  )) {
    const contents = await readFile(join(root, path), "utf8");

    if (
      /\bPrisma\w*\b|@prisma\/|generated\/prisma\/|(?:^|[/.'"])\bdatabase\b(?:[/.'"]|$)/im.test(
        contents
      )
    ) {
      violations.push(`${path} must not reference Prisma or database access`);
    }

    if (/\bDATABASE_URL\b/.test(contents)) {
      violations.push(`${path} must not reference DATABASE_URL`);
    }
  }

  const apiFiles = await listFiles(root, "apps/api/src");

  for (const path of apiFiles.filter((file) =>
    /\.(?:[cm]?[jt]sx?)$/.test(file)
  )) {
    const contents = await readFile(join(root, path), "utf8");

    if (/\benableCors\s*\(/.test(contents)) {
      violations.push(`${path} must not enable browser CORS`);
    }
  }

  for (const path of webFiles.filter(
    (file) => file.endsWith(".css") && file !== "apps/web/src/styles/tokens.css"
  )) {
    const contents = await readFile(join(root, path), "utf8");
    const colors = contents.match(
      /#[\da-fA-F]{3}(?:[\da-fA-F]{1}|[\da-fA-F]{3}|[\da-fA-F]{5})?(?![\da-fA-F])/g
    );

    for (const color of colors ?? []) {
      violations.push(
        `${path} contains raw color ${color}; ` +
          "define colors in apps/web/src/styles/tokens.css"
      );
    }
  }
}

function repositoryLinkTargets(markdown) {
  const targets = [];
  let fence;

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);

    if (fenceMatch) {
      if (!fence) {
        fence = {
          character: fenceMatch[1][0],
          length: fenceMatch[1].length
        };
      } else if (
        fence.character === fenceMatch[1][0] &&
        fenceMatch[1].length >= fence.length
      ) {
        fence = undefined;
      }
      continue;
    }

    if (fence) continue;

    const links = line.matchAll(/!?\[[^\]]*]\(([^)\s]+)(?:\s+[^)]*)?\)/g);

    for (const link of links) {
      const target = link[1];

      if (
        target.startsWith("#") ||
        target.startsWith("/") ||
        /^[a-z][a-z\d+.-]*:/i.test(target)
      ) {
        continue;
      }

      targets.push(target);
    }
  }

  return targets;
}

function decodeLinkTarget(target) {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

async function isFile(root, path) {
  if (path === ".." || path.startsWith("../")) return false;

  try {
    return (await stat(join(root, path))).isFile();
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    throw error;
  }
}

async function verifyMarkdownLinks(root, trackedFiles, violations) {
  const trackedFileSet = new Set(trackedFiles);
  const markdownFiles = [...trackedFileSet]
    .filter((path) => path.endsWith(".md"))
    .sort();

  for (const sourcePath of markdownFiles) {
    const markdown = await readFile(join(root, sourcePath), "utf8");

    for (const rawTarget of repositoryLinkTargets(markdown)) {
      const targetWithoutFragment = rawTarget.split("#", 1)[0];
      if (!targetWithoutFragment) continue;

      const decodedTarget = decodeLinkTarget(targetWithoutFragment);
      const targetPath = posix.normalize(
        posix.join(posix.dirname(sourcePath), decodedTarget)
      );

      if (!(await isFile(root, targetPath))) {
        violations.push(`${sourcePath} links to missing file ${targetPath}`);
        continue;
      }

      const isTaskStateIndex = sourcePath === "docs/superpowers/README.md";
      const requiresTracking =
        isTaskStateIndex || targetPath.startsWith("docs/superpowers/");

      if (requiresTracking && !trackedFileSet.has(targetPath)) {
        const kind = isTaskStateIndex ? "task-state" : "Superpowers";
        violations.push(
          `${sourcePath} links to untracked ${kind} file ${targetPath}`
        );
      }
    }
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

  await verifySourceBoundaries(root, violations);
  await verifyMarkdownLinks(root, resolvedTrackedFiles, violations);

  if (violations.length > 0) {
    throw new RepositoryPolicyError(violations);
  }

  return { packageCount: requiredPackages.size };
}
