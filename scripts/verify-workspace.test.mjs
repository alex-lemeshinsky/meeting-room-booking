import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("workspace pins the approved runtime and package manager", async () => {
  const root = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(root.engines.node, "24.18.x");
  assert.equal(root.packageManager, "pnpm@11.17.0");
  assert.equal(root.scripts.test, "pnpm test:unit");
});

test("workspace declares every architectural package", async () => {
  const workspace = await readFile("pnpm-workspace.yaml", "utf8");

  assert.match(workspace, /apps\/\*/);
  assert.match(workspace, /packages\/\*/);
});
