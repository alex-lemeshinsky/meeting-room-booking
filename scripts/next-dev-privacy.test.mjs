import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";

const repositoryRoot = resolve(import.meta.dirname, "..");
const webRoot = resolve(repositoryRoot, "apps/web");
const nextCli = resolve(webRoot, "node_modules/next/dist/bin/next");
const syntheticToken = "V".repeat(43);

test(
  "direct Next development keeps verification tokens out of logs while logging ordinary routes",
  { timeout: 90_000 },
  async () => {
    const port = await reservePort();
    let output = "";
    const server = spawn(
      process.execPath,
      [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)],
      {
        cwd: webRoot,
        env: {
          ...process.env,
          API_INTERNAL_URL: "http://127.0.0.1:1",
          NEXT_TELEMETRY_DISABLED: "1"
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    server.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    server.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    try {
      await waitForHttp(`http://127.0.0.1:${port}/login`, server, () => output);

      const verification = await globalThis.fetch(
        `http://127.0.0.1:${port}/verify-email?token=${syntheticToken}`
      );
      assert.equal(verification.status, 200);
      assert.equal(verification.headers.get("referrer-policy"), "no-referrer");
      await verification.arrayBuffer();

      const ordinary = await globalThis.fetch(`http://127.0.0.1:${port}/login`);
      assert.equal(ordinary.status, 200);
      await ordinary.arrayBuffer();
      await waitForOutput(() => output, "GET /login");

      const plainOutput = stripVTControlCharacters(output);
      assert.doesNotMatch(plainOutput, /GET \/verify-email/);
      assert.doesNotMatch(plainOutput, /\/verify-email\?token=/);
      assert.equal(plainOutput.includes(syntheticToken), false);
      assert.match(plainOutput, /GET \/login/);
    } finally {
      await stop(server);
    }
  }
);

async function reservePort() {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  if (typeof address === "string" || address === null) {
    socket.close();
    throw new Error("Unable to reserve a development-server port");
  }
  const { port } = address;
  socket.close();
  await once(socket, "close");
  return port;
}

async function waitForHttp(url, server, getOutput) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next development server exited early:\n${getOutput()}`);
    }
    try {
      const response = await globalThis.fetch(url);
      await response.arrayBuffer();
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(
    `Next development server did not become ready:\n${getOutput()}`
  );
}

async function waitForOutput(getOutput, expected) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (stripVTControlCharacters(getOutput()).includes(expected)) return;
    await delay(50);
  }
  throw new Error(`Development log did not contain ${expected}`);
}

async function stop(server) {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const exited = once(server, "exit");
  server.kill("SIGTERM");
  const stopped = await Promise.race([
    exited.then(() => true),
    delay(5_000).then(() => false)
  ]);
  if (!stopped && server.exitCode === null && server.signalCode === null) {
    server.kill("SIGKILL");
    await exited;
  }
}
