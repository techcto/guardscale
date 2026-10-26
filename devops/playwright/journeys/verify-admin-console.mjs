// End-to-end proof of the root admin console: sidenav, organization/user/server list and detail
// pages, metered usage for the current billing period, privacy limits, and root-only access.
// Requires a SaaS-mode deployment (the directory and usage metering do not exist in private mode).
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { BASE_URL, ROOT_USERNAME, ROOT_PASSWORD, login, makeShot, randomEmail, randomUsername } from '../lib/helpers.mjs';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const shot = process.env.GUARDSCALE_SCREENSHOTS ? makeShot(process.env.GUARDSCALE_SCREENSHOTS) : async () => {};
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const api = page.request;
    await login(page, ROOT_USERNAME, ROOT_PASSWORD);

    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/admin/organizations');
    const nav = page.getByRole('navigation', { name: 'Admin navigation' });
    for (const item of ['Organizations', 'Users', 'Servers', 'Settings']) await nav.getByRole('link', { name: item, exact: true }).waitFor();
    assert.equal(await nav.getByRole('link', { name: 'Organizations', exact: true }).getAttribute('aria-current'), 'page');
    assert.equal(await page.getByRole('button', { name: /Add organization/ }).count(), 0, 'admin is view-only');

    // Seed an organization, a member, and a server through the product's own APIs.
    const orgName = `Playwright admin org ${randomUsername('o')}`;
    const created = await api.post(`${BASE_URL}/api/orgs`, { data: { name: orgName } });
    assert.equal(created.status(), 201, await created.text());
    const orgId = (await created.json()).id;
    assert.equal((await api.post(`${BASE_URL}/api/orgs/active`, { data: { orgId } })).status(), 200);
    // SaaS accounts verify their email before signing in; Add user then admits the account by email.
    const username = randomEmail('viewer'), password = `pw-${randomUsername('p')}`;
    const seed = await browser.newContext();
    const signedUp = await seed.request.post(`${BASE_URL}/api/auth/signup`, { data: { email: username, displayName: 'Playwright Admin Viewer', password } });
    assert.equal(signedUp.status(), 201, await signedUp.text());
    const { verifyLink } = await signedUp.json();
    assert.equal((await seed.request.post(`${BASE_URL}/api/auth/verify-email`, { data: { token: new URL(verifyLink).searchParams.get('token') } })).status(), 200);
    await seed.close();
    const member = await api.post(`${BASE_URL}/api/v1/users`, { headers: { Origin: BASE_URL }, data: { email: username, role: 'viewer' } });
    assert.equal(member.status(), 201, await member.text());
    const userId = (await member.json()).id;
    const { tenantId, enrollmentToken } = await (await api.get(`${BASE_URL}/api/v1/nodes/enrollment`)).json();
    assert.equal(tenantId, orgId, 'enrollment must belong to the new organization');
    const serverId = randomUsername('node'), serverName = `Playwright server ${serverId}`;
    const heartbeat = await api.post(`${BASE_URL}/api/v1/agents/heartbeat`, {
      headers: { authorization: `Bearer ${tenantId}.${randomUsername('agent')}.${enrollmentToken}` },
      data: { server_id: serverId, platform: 'amd64', display_name: serverName },
    });
    assert.equal(heartbeat.status(), 202, 'heartbeat should be accepted and meter one server-hour');

    // Organization detail: overview, metered usage this billing period, members, servers.
    await page.goto(`${BASE_URL}/admin/organizations`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: new RegExp(orgName) }).click();
    await page.waitForURL(`**/admin/organizations/${orgId}`);
    await page.locator('.admin-header-title', { hasText: orgName }).waitFor();
    const usage = page.locator('section.card', { has: page.getByRole('heading', { name: 'Usage this billing period' }) });
    for (const meter of ['Server hours', 'Log ingestion', 'AI credits']) await usage.getByRole('cell', { name: meter, exact: true }).waitFor();
    const serverHours = await usage.locator('tr', { hasText: 'Server hours' }).locator('td').nth(1).innerText();
    assert.match(serverHours, /^[1-9][\d,]* hours?$/, `the heartbeat must be metered, saw "${serverHours}"`);
    await page.getByRole('link', { name: /Playwright Admin Viewer/ }).waitFor();
    await page.getByRole('link', { name: new RegExp(serverName) }).waitFor();
    await shot(page, 'admin-organization-detail', { fullPage: true });

    // Users: list -> detail.
    await nav.getByRole('link', { name: 'Users', exact: true }).click();
    await page.waitForURL('**/admin/users');
    await page.getByRole('link', { name: /Playwright Admin Viewer/ }).click();
    await page.waitForURL(`**/admin/users/${userId}`);
    await page.locator('.admin-header-title', { hasText: 'Playwright Admin Viewer' }).waitFor();
    await page.getByRole('link', { name: new RegExp(orgName) }).first().waitFor();
    await shot(page, 'admin-user-detail', { fullPage: true });

    // Servers: list -> detail.
    await nav.getByRole('link', { name: 'Servers', exact: true }).click();
    await page.waitForURL('**/admin/servers');
    await page.getByRole('link', { name: new RegExp(serverName) }).first().click();
    await page.waitForURL(`**/admin/servers/${orgId}/*`);
    await page.locator('.admin-header-title', { hasText: serverName }).waitFor();
    await page.getByRole('link', { name: /Playwright Admin Viewer/ }).waitFor();
    await shot(page, 'admin-server-detail', { fullPage: true });
    const serverPath = new URL(page.url()).pathname;

    for (const path of ['/admin/organizations', `/admin/organizations/${orgId}`, `/admin/users/${userId}`, '/admin/servers', serverPath, '/admin/settings']) {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
      assert.ok(!(await page.content()).includes(enrollmentToken), `${path} must not expose the enrollment token`);
    }
    await page.locator('.admin-header-title', { hasText: 'Settings' }).waitFor();
    await page.getByText('Usage export to Stripe').waitFor();

    // Non-root members cannot open admin pages.
    const viewer = await browser.newContext(), viewerPage = await viewer.newPage();
    await login(viewerPage, username, password);
    for (const path of ['/admin/organizations', serverPath]) {
      await viewerPage.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
      await viewerPage.waitForURL('**/settings');
    }
    await viewer.close();
    console.log('PASS: admin sidenav, organization/user/server list and detail pages, metered usage, privacy limits, and root-only access.');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
