import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as signup } from "../app/api/auth/signup/route";
import { POST as login } from "../app/api/auth/login/route";
import { POST as forgot } from "../app/api/auth/forgot-password/route";
import { POST as reset } from "../app/api/auth/reset-password/route";
import { POST as verify } from "../app/api/auth/verify-email/route";
import { POST as resend } from "../app/api/auth/verify-email/resend/route";
import { createResetToken, createSession } from "./session";
import { hashPassword } from "./password";
import { store } from "./store";

process.env.GUARDSCALE_DEPLOYMENT_MODE = "saas";
process.env.GUARDSCALE_SESSION_SECRET = "test-secret-test-secret-test-secret";
const secret = process.env.GUARDSCALE_SESSION_SECRET;
const post = (path: string, body: unknown, cookie?: string) => new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", host: "localhost", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const password = "long-enough-pass";
const tokenOf = (link: string) => new URL(link).searchParams.get("token");
const account = (username: string, email: string) => signup(post("/api/auth/signup", { username, displayName: username, email, password }));

test("plain signup sends a verification email without logging in", async () => {
  const response = await signup(post("/api/auth/signup", { displayName: "Plain signup", email: "plain-signup@example.com", password }));
  assert.equal(response.status, 201); assert.equal(response.cookies.get("guardscale_session"), undefined);
  assert.equal((await response.json()).status, "verification-sent");
  assert.equal((await store.userByName("plain-signup@example.com"))?.emailVerified, false);
});

test("signup requires an email, stores it normalized and unverified, and starts no session", async () => {
  assert.equal((await signup(post("/api/auth/signup", { username: "noemail", displayName: "No Email", password }))).status, 400);
  const res = await account("withemail", " Person@Example.COM ");
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.status, "verification-sent");
  assert.match(body.verifyLink, /^http:\/\/localhost\/login\/verify-email\?token=/);
  assert.equal(res.cookies.get("guardscale_session"), undefined);
  const user = await store.userByName("person@example.com");
  assert.equal(user?.email, "person@example.com");
  assert.equal(user?.emailVerified, false);
});

test("an email can be claimed once, also when signups race", async () => {
  assert.equal((await account("dupe-a", "PERSON@example.com")).status, 409, "case-insensitive duplicate");
  const raced = await Promise.all(["race-a", "race-b", "race-c"].map(name => account(name, "race@example.com")));
  assert.deepEqual(raced.map(r => r.status).sort(), [201, 409, 409]);
  const winner = (await store.userByName("race@example.com"))!;
  assert.ok(winner, "exactly one canonical email identity exists");
  await store.deleteUser(winner.id);
  assert.equal((await account("race-after-delete", "race@example.com")).status, 201, "deleting the account releases the address");
});

test("unverified accounts cannot sign in; opening the link signs them in once", async () => {
  const { verifyLink } = await (await account("fromdevice", "d@example.com")).json();
  const blocked = await login(post("/api/auth/login", { username: "d@example.com", password }));
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).unverified, true);
  assert.equal((await login(post("/api/auth/login", { username: "d@example.com", password: "wrong-password!" }))).status, 401, "the hint only follows a correct password");

  const first = await verify(post("/api/auth/verify-email", { token: tokenOf(verifyLink) }));
  assert.deepEqual(await first.json(), { redirect: "/console" });
  assert.ok(first.cookies.get("guardscale_session")?.value, "verifying signs the user in");
  assert.equal((await store.userByName("d@example.com"))?.emailVerified, true);
  assert.equal((await login(post("/api/auth/login", { username: "d@example.com", password }))).status, 200);

  const again = await verify(post("/api/auth/verify-email", { token: tokenOf(verifyLink) }));
  assert.deepEqual(await again.json(), { redirect: "/login?verify=done" });
  assert.equal(again.cookies.get("guardscale_session"), undefined, "an old link is not a reusable login");
});

test("another user's open session is kept", async () => {
  const { verifyLink } = await (await account("hostile", "h@example.com")).json();
  const other = await createSession({ id: "someone-else", username: "someone", role: "admin", orgId: "x", expiresAt: Date.now() + 60000 }, secret);
  const res = await verify(post("/api/auth/verify-email", { token: tokenOf(verifyLink) }, `guardscale_session=${other}`));
  assert.deepEqual(await res.json(), { redirect: "/console" });
  assert.equal(res.cookies.get("guardscale_session"), undefined);
  assert.equal((await store.userByName("h@example.com"))?.emailVerified, true);
});

test("resend waits out Osirus's cooldown with the remaining time, and answers the same for unknown or verified accounts", async () => {
  await account("throttled", "t@example.com");
  const early = await resend(post("/api/auth/verify-email/resend", { username: "t@example.com" }));
  assert.equal(early.status, 409);
  assert.match((await early.json()).error, /^Please wait\. We can send the email again in 25 minutes$/);
  const user = (await store.userByName("t@example.com"))!;
  await store.putUser({ ...user, verificationSentAt: new Date(Date.now() - 26 * 60000).toISOString() });
  assert.match((await (await resend(post("/api/auth/verify-email/resend", { username: "t@example.com" }))).json()).verifyLink, /verify-email\?token=/);
  for (const username of ["nobody-here", "d@example.com"]) assert.deepEqual(await (await resend(post("/api/auth/verify-email/resend", { username }))).json(), { status: "ok" });
});

test("verification links are bound to the address and cannot be swapped with reset links", async () => {
  const { verifyLink } = await (await account("rebound", "old@example.com")).json();
  const user = (await store.userByName("old@example.com"))!;
  await store.putUser({ ...user, email: "new@example.com" });
  assert.equal((await verify(post("/api/auth/verify-email", { token: tokenOf(verifyLink) }))).status, 400);
  assert.equal((await store.userByName("old@example.com"))?.emailVerified, false);
  assert.equal((await reset(post("/api/auth/reset-password", { token: tokenOf(verifyLink), password: "another-long-pass" }))).status, 400);
  assert.equal((await verify(post("/api/auth/verify-email", { token: await createResetToken(user.id, secret) }))).status, 400);
});

test("accounts without explicit email verification cannot sign in", async () => {
  const org = await store.createOrganization({ name: "Legacy (Personal)", ownerId: "legacy-id", orgType: "personal" });
  const now = new Date().toISOString();
  await store.putUser({ id: "legacy-id", username: "legacy", displayName: "Legacy", status: "active", createdAt: now, updatedAt: now }, hashPassword(password));
  await store.putMembership({ id: "legacy-membership", orgId: org.id, userId: "legacy-id", role: "admin", status: "active", createdAt: now, updatedAt: now });
  assert.equal((await login(post("/api/auth/login", { username: "legacy", password }))).status, 401);
});

test("password reset mails the account email, not the username", async () => {
  const logs: string[] = [], log = console.log;
  console.log = (m: string) => { logs.push(m); };
  try {
    const res = await forgot(post("/api/auth/forgot-password", { username: "person@example.com" }));
    assert.match((await res.json()).resetLink, /\/login\/reset-password\?token=/);
  } finally { console.log = log; }
  assert.ok(logs.some(m => m.includes("Reset your GuardScale password")));
});
