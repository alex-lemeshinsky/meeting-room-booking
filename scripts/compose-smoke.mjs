import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { URL } from "node:url";
import { chromium } from "@playwright/test";

const projectName = `mrb-stage6-smoke-${process.pid}`;
const baseUrl = "http://127.0.0.1:3000";
const appOrigin = "http://localhost:3000";
const expectedCapacities = [12, 16];
const verificationProbe = "P".repeat(43);
const genericLogProbe = "compose-generic-route-log-probe";
const composeArgs = ["compose", "--project-name", projectName];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: new URL("..", import.meta.url),
      env: process.env,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
    });
    let stdout = "";
    let stderr = "";

    if (options.capture) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(
        new Error(
          `${command} ${args.join(" ")} failed (${signal ?? `exit ${code}`})${
            stderr ? `\n${redact(stderr)}` : ""
          }`
        )
      );
    });
  });
}

async function compose(...args) {
  return run("docker", [...composeArgs, ...args]);
}

async function waitForReady(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await globalThis.fetch(`${baseUrl}/api/v1/health/ready`);
      if (response.ok) return;
      lastError = new Error(`readiness returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(1_000);
  }

  throw new Error(
    `readiness timed out: ${lastError?.message ?? "no response"}`
  );
}

function cookieHeader(response) {
  const cookies = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0]);
  if (!cookies.some((cookie) => cookie.startsWith("mrb_session="))) {
    throw new Error("login response did not include the session cookie");
  }
  return cookies.join("; ");
}

async function login() {
  const response = await globalThis.fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: appOrigin
    },
    body: JSON.stringify({
      email: "alex@example.com",
      password: "Meeting123!"
    })
  });
  if (!response.ok) {
    throw new Error(`login returned ${response.status}`);
  }
  return cookieHeader(response);
}

async function assertFilteredRooms(cookies) {
  const response = await globalThis.fetch(
    `${baseUrl}/api/v1/rooms?minCapacity=12`,
    {
      headers: { cookie: cookies }
    }
  );
  if (!response.ok) {
    throw new Error(`filtered rooms returned ${response.status}`);
  }

  const payload = await response.json();
  const capacities = payload.rooms?.map((room) => room.capacity);
  if (JSON.stringify(capacities) !== JSON.stringify(expectedCapacities)) {
    throw new Error(
      `expected room capacities ${expectedCapacities.join(", ")}, received ${JSON.stringify(capacities)}`
    );
  }
}

function redact(value) {
  return value
    .replace(/([?&]token=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(mrb_(?:session|csrf)=)[^;\s]+/gi, "$1[REDACTED]")
    .replace(/("?password"?\s*[:=]\s*)[^,\s}]+/gi, "$1[REDACTED]");
}

async function printDiagnostics() {
  for (const args of [["ps"], ["logs", "--no-color", "--tail", "200"]]) {
    try {
      const result = await run("docker", [...composeArgs, ...args], {
        capture: true
      });
      process.stderr.write(redact(result.stdout + result.stderr));
    } catch (error) {
      console.error(redact(error.message));
    }
  }
}

async function assertVerificationRoutePrivacy() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const response = await page.goto(
      `${baseUrl}/verify-email?token=${verificationProbe}`,
      { waitUntil: "networkidle" }
    );
    if (!response?.ok()) {
      throw new Error(
        `verification page probe returned ${response?.status() ?? "no response"}`
      );
    }

    const referrerPolicy = response.headers()["referrer-policy"];
    if (referrerPolicy !== "no-referrer") {
      throw new Error(
        `verification page must return Referrer-Policy: no-referrer; received ${JSON.stringify(referrerPolicy ?? null)}`
      );
    }
  } finally {
    await browser.close();
  }

  const genericPage = await globalThis.fetch(
    `${baseUrl}/login?probe=${genericLogProbe}`
  );
  if (!genericPage.ok) {
    throw new Error(`generic page probe returned ${genericPage.status}`);
  }

  const proxyLogs = await run(
    "docker",
    [...composeArgs, "logs", "--no-color", "proxy"],
    { capture: true }
  );
  const proxyOutput = proxyLogs.stdout + proxyLogs.stderr;
  if (proxyOutput.includes(verificationProbe)) {
    throw new Error("proxy logs exposed the verification token query");
  }
  if (!proxyOutput.includes(genericLogProbe)) {
    throw new Error("proxy logs omitted the generic route probe");
  }
}

async function assertRecurringBookingSeries(cookies) {
  const roomId = "10000000-0000-4000-8000-000000000001";
  const startAt = "2030-06-10T07:00:00.000Z";
  const endAt = "2030-06-10T07:30:00.000Z";

  const csrfMatch = cookies.match(/mrb_csrf=([^;]+)/);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  const createRes = await globalThis.fetch(`${baseUrl}/api/v1/booking-series`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: appOrigin,
      cookie: cookies,
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({
      roomId,
      title: "Smoke Test Series",
      startAt,
      endAt,
      occurrenceCount: 2
    })
  });

  if (!createRes.ok) {
    throw new Error(`booking series creation returned ${createRes.status}`);
  }

  const seriesData = await createRes.json();
  const seriesId = seriesData.series.id;
  if (!seriesId || seriesData.occurrences.length !== 2) {
    throw new Error(
      "series creation response missing expected occurrence count or id"
    );
  }

  const cancelRes = await globalThis.fetch(
    `${baseUrl}/api/v1/booking-series/${seriesId}/cancel`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: appOrigin,
        cookie: cookies,
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({})
    }
  );

  if (!cancelRes.ok) {
    throw new Error(`booking series cancellation returned ${cancelRes.status}`);
  }

  const cancelData = await cancelRes.json();
  if (cancelData.cancelledCount !== 2) {
    throw new Error(
      `expected 2 cancelled occurrences, received ${cancelData.cancelledCount}`
    );
  }
}

async function assertNotificationFlow(cookies) {
  const roomId = "10000000-0000-4000-8000-000000000001";
  const now = Date.now();
  const startA = new Date(now + 60_000).toISOString();
  const endA = new Date(now + 6 * 60_000).toISOString();
  const startB = new Date(now + 6 * 60_000).toISOString();
  const endB = new Date(now + 11 * 60_000).toISOString();

  const csrfMatch = cookies.match(/mrb_csrf=([^;]+)/);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  const createA = await globalThis.fetch(`${baseUrl}/api/v1/bookings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: appOrigin,
      cookie: cookies,
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({
      roomId,
      title: "Smoke Booking A",
      startAt: startA,
      endAt: endA
    })
  });

  if (!createA.ok) {
    throw new Error(`booking A creation returned ${createA.status}`);
  }

  const createB = await globalThis.fetch(`${baseUrl}/api/v1/bookings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: appOrigin,
      cookie: cookies,
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({
      roomId,
      title: "Smoke Booking B",
      startAt: startB,
      endAt: endB
    })
  });

  if (!createB.ok) {
    throw new Error(`booking B creation returned ${createB.status}`);
  }

  await delay(18_000);

  const notifRes = await globalThis.fetch(`${baseUrl}/api/v1/notifications`, {
    headers: { cookie: cookies }
  });

  if (!notifRes.ok) {
    throw new Error(`notifications GET returned ${notifRes.status}`);
  }

  const notifData = await notifRes.json();
  if (
    !Array.isArray(notifData.notifications) ||
    notifData.notifications.length === 0
  ) {
    throw new Error(
      "expected at least 1 notification from back-to-back bookings"
    );
  }
}

async function main() {
  let attemptedStartup = false;
  try {
    attemptedStartup = true;
    await compose("up", "--build", "--wait");
    await waitForReady();
    await assertVerificationRoutePrivacy();
    const sessionCookies = await login();
    await assertFilteredRooms(sessionCookies);
    await assertRecurringBookingSeries(sessionCookies);
    await assertNotificationFlow(sessionCookies);

    await compose("restart", "db");
    await waitForReady();
    await assertFilteredRooms(sessionCookies);
    await assertRecurringBookingSeries(sessionCookies);
    console.log(
      "Compose smoke test passed, including database restart recovery."
    );
  } catch (error) {
    console.error(redact(error.message));
    if (attemptedStartup) await printDiagnostics();
    process.exitCode = 1;
  } finally {
    await compose("down", "--volumes", "--remove-orphans").catch((error) => {
      console.error(`Compose cleanup failed: ${redact(error.message)}`);
      process.exitCode = 1;
    });
  }
}

await main();
