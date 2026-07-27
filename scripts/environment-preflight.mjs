const nodeContractPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.x$/;
const nodeVersionPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const packageManagerPattern =
  /^pnpm@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;

const nodeRemediation = "  Run: nvm install && nvm use";

async function probe(runCommand, command, args) {
  try {
    const { stdout = "" } = await runCommand(command, args);
    return { status: "fulfilled", value: stdout };
  } catch {
    return { status: "rejected", value: "" };
  }
}

function checkNode(nodeVersion, requirement) {
  const contract = nodeContractPattern.exec(requirement ?? "");
  if (!contract) {
    return [
      `✗ package.json#engines.node must use "major.minor.x"; received ${JSON.stringify(requirement)}`,
      "  Set a supported Node.js contract before running repository commands."
    ];
  }

  const installed = nodeVersionPattern.exec(nodeVersion);
  const displayVersion = nodeVersion.replace(/^v/, "");
  if (
    !installed ||
    installed[1] !== contract[1] ||
    installed[2] !== contract[2]
  ) {
    return [
      `✗ Node.js ${displayVersion} does not satisfy ${requirement}`,
      nodeRemediation
    ];
  }

  return [`✓ Node.js ${displayVersion} satisfies ${requirement}`];
}

function checkPnpm(probeResult, packageManager) {
  const contract = packageManagerPattern.exec(packageManager ?? "");
  if (!contract) {
    return [
      `✗ package.json#packageManager must use "pnpm@major.minor.patch"; received ${JSON.stringify(packageManager)}`,
      "  Pin an exact pnpm version before running repository commands."
    ];
  }

  const remediation = `  Run: npm install --global ${packageManager}`;
  if (probeResult.status === "rejected" || probeResult.value.trim() === "") {
    return [`✗ pnpm is unavailable; expected ${packageManager}`, remediation];
  }

  const installed = probeResult.value.trim();
  if (installed !== contract[1]) {
    return [
      `✗ pnpm ${installed} does not satisfy ${packageManager}`,
      remediation
    ];
  }

  return [`✓ pnpm ${installed} satisfies ${packageManager}`];
}

function checkDocker(probeResult) {
  if (probeResult.status === "rejected") {
    return [
      "✗ Docker CLI is unavailable",
      "  Install Docker Desktop or another Docker distribution with Compose support."
    ];
  }

  return ["✓ Docker CLI is available"];
}

function checkCompose(probeResult) {
  if (probeResult.status === "rejected") {
    return [
      "✗ Docker Compose plugin is unavailable",
      "  Install or enable the Docker Compose plugin."
    ];
  }

  return ["✓ Docker Compose plugin is available"];
}

export async function checkEnvironment({
  nodeVersion,
  packageJson,
  runCommand
}) {
  const [pnpm, docker, compose] = await Promise.all([
    probe(runCommand, "pnpm", ["--version"]),
    probe(runCommand, "docker", ["--version"]),
    probe(runCommand, "docker", ["compose", "version"])
  ]);

  const checks = [
    checkNode(nodeVersion, packageJson.engines?.node),
    checkPnpm(pnpm, packageJson.packageManager),
    checkDocker(docker),
    checkCompose(compose)
  ];
  const ok = checks.every(([line]) => line.startsWith("✓"));

  return {
    ok,
    lines: [
      ok ? "environment ready" : "environment not ready",
      ...checks.flat()
    ]
  };
}
