import type { PostgresTestApp } from "../support/postgres-test-app.js";
import { startPostgresTestApp } from "../support/postgres-test-app.js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("PATCH /api/v1/me", () => {
  let context: PostgresTestApp;

  beforeAll(async () => {
    context = await startPostgresTestApp({ seed: true });
  }, 120_000);

  afterAll(async () => context.stop());

  it("rejects an unauthenticated request", async () => {
    await request(context.app.getHttpServer())
      .patch("/api/v1/me")
      .set("Origin", "http://127.0.0.1:3000")
      .send({ weekStartsOn: 7 })
      .expect(401);
  });

  it("persists the week start and reflects it in the session", async () => {
    const { agent, csrfToken } = await loginAsOlena(context);

    const before = await agent.get("/api/v1/auth/session").expect(200);
    expect(before.body.user.weekStartsOn).toBe(1);

    const updated = await agent
      .patch("/api/v1/me")
      .set("Origin", "http://127.0.0.1:3000")
      .set("X-CSRF-Token", csrfToken)
      .send({ weekStartsOn: 7 })
      .expect(200);
    expect(updated.body.user.weekStartsOn).toBe(7);

    const after = await agent.get("/api/v1/auth/session").expect(200);
    expect(after.body.user.weekStartsOn).toBe(7);
  });

  it("rejects values outside the integer range 1 to 7", async () => {
    const { agent, csrfToken } = await loginAsOlena(context);

    for (const weekStartsOn of [0, 8, 1.5, "monday"]) {
      await agent
        .patch("/api/v1/me")
        .set("Origin", "http://127.0.0.1:3000")
        .set("X-CSRF-Token", csrfToken)
        .send({ weekStartsOn })
        .expect(400);
    }
  });
});

interface AuthenticatedAgent {
  agent: ReturnType<typeof request.agent>;
  csrfToken: string;
}

async function loginAsOlena(
  context: PostgresTestApp
): Promise<AuthenticatedAgent> {
  const agent = request.agent(context.app.getHttpServer());
  const response = await agent
    .post("/api/v1/auth/login")
    .set("Origin", "http://127.0.0.1:3000")
    .send({ email: "olena@example.com", password: "Rooms123!" })
    .expect(200);
  return { agent, csrfToken: cookieValue(cookie(response, "mrb_csrf")) };
}

function cookie(response: request.Response, name: string): string {
  const setCookie = response.headers["set-cookie"];
  const cookieHeaders = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const value = cookieHeaders.find((item) => item.startsWith(`${name}=`));
  if (!value) throw new Error(`Missing ${name} cookie`);
  return value;
}

function cookieValue(cookieHeader: string): string {
  return cookieHeader.slice(
    cookieHeader.indexOf("=") + 1,
    cookieHeader.indexOf(";")
  );
}
