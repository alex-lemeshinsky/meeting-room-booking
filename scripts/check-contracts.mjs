import { spawnSync } from "node:child_process";

const generated = [
  "apps/api/openapi.json",
  "packages/contracts/src/generated/api.ts"
];

const generation = spawnSync("pnpm", ["contracts:generate"], {
  stdio: "inherit"
});
if (generation.status !== 0) {
  process.exit(generation.status ?? 1);
}

const diff = spawnSync(
  "git",
  ["diff", "--exit-code", "HEAD", "--", ...generated],
  { stdio: "inherit" }
);

if (diff.status !== 0) {
  console.error("generated contracts are stale");
  process.exit(diff.status ?? 1);
}
