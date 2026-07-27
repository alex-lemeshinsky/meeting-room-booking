import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const expected = new Map([
  ["apps/web/package.json", "@mrb/web"],
  ["apps/api/package.json", "@mrb/api"],
  ["packages/time/package.json", "@mrb/time"],
  ["packages/contracts/package.json", "@mrb/contracts"],
  ["packages/config/package.json", "@mrb/config"]
]);

for (const [path, name] of expected) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  assert.equal(manifest.name, name, `${path} must declare ${name}`);
  assert.equal(manifest.private, true, `${path} must remain private`);
  assert.equal(manifest.type, "module", `${path} must use ESM`);
}

console.log(`workspace verified: ${expected.size} packages`);
