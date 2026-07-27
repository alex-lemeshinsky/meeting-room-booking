import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "../src/bootstrap.js";
import { createOpenApiDocument } from "../src/openapi/openapi.js";

const app = await createApp();

try {
  await app.init();
  const document = createOpenApiDocument(app);
  const output = `${JSON.stringify(document, null, 2)}\n`;
  await writeFile(resolve(import.meta.dirname, "../openapi.json"), output);
} finally {
  await app.close();
}
