// End-to-end proof that the fake-data problem is actually gone: log in, fetch the real
// per-org enrollment credential (replacing the old client-invented random tenant id),
// simulate what the onboarding bash script does (heartbeat + an event + an incident using
// that credential), then confirm the Nodes list and the new node detail page actually
// render what was just recorded -- not hardcoded zeros.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { BASE_URL, ROOT_USERNAME, ROOT_PASSWORD, login, randomUsername } from '../lib/helpers.mjs';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await login(page, ROOT_USERNAME, ROOT_PASSWORD);

  const enrollmentResp = await page.request.get(`${BASE_URL}/api/v1/nodes/enrollment`);
  assert.equal(enrollmentResp.status(), 200, 'enrollment endpoint should be reachable to a root session');
  const { tenantId, enrollmentToken } = await enrollmentResp.json();
  assert.ok(tenantId && enrollmentToken, 'enrollment payload must include a real tenantId and enrollmentToken');

  const agentId = randomUsername('agent');
  const serverId = randomUsername('node');
  const tag = 'playwright-tag';
  const bearer = `${tenantId}.${agentId}.${enrollmentToken}`;

  const displayName = `Playwright synthetic node ${serverId}`;
  const heartbeat = await page.request.post(`${BASE_URL}/api/v1/agents/heartbeat`, {
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    data: { server_id: serverId, platform: 'amd64', tags: [tag], display_name: displayName },
  });
  assert.equal(heartbeat.status(), 202, 'heartbeat with a real enrollment token should be accepted');

  const badBearer = `${tenantId}.${agentId}.not-the-real-token`;
  const rejected = await page.request.post(`${BASE_URL}/api/v1/agents/heartbeat`, {
    headers: { authorization: `Bearer ${badBearer}`, 'content-type': 'application/json' },
    data: { server_id: serverId },
  });
  assert.equal(rejected.status(), 401, 'a forged enrollment token must be rejected -- this is the security fix, not just a feature');

  await page.request.post(`${BASE_URL}/api/v1/agents/events`, {
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    data: { server_id: serverId, type: 'viewer.request', metadata: { path: '/synthetic' } },
  });
  const incidentId = randomUsername('incident');
  await page.request.post(`${BASE_URL}/api/v1/agents/incidents`, {
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    data: { id: incidentId, server_id: serverId, state: 'WATCH', started_at: new Date().toISOString() },
  });

  await page.goto(`${BASE_URL}/nodes`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((name) => document.body.innerText.includes(name), displayName, { timeout: 15000 });
  await page.getByText(displayName, { exact: true }).click();
  await page.waitForURL((url) => url.pathname.includes(serverId), { timeout: 15000, waitUntil: 'domcontentloaded' });

  await page.waitForFunction((id) => document.body.innerText.includes(id), incidentId, { timeout: 15000 });
  await page.waitForFunction(() => document.body.innerText.includes('viewer.request'), { timeout: 15000 });
  const bodyText = await page.locator('body').innerText();
  assert.ok(bodyText.includes(tag), 'node detail page should show the tag it was enrolled with');

  await context.close();
  await browser.close();
  console.log('PASS verify-node-enrollment-and-detail');
})().catch((err) => {
  console.error('FAIL verify-node-enrollment-and-detail:', err.message);
  process.exit(1);
});
