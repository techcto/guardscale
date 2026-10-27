import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './setup-plans.mjs';
import pricing from '../../src/lib/billing-pricing.json' with {type:'json'};

function fakeStripe() {
  const products = new Map(), prices = [], updates = [], uploads = [], coupons = new Map(), promotions = [], meters = [];
  const client = {
    files: { create: async v => { uploads.push(v.purpose); return { id: 'file_1' }; } },
    fileLinks: { create: async () => ({ url: 'https://files.stripe.com/links/logo' }) },
    products: {
      retrieve: async id => { if (!products.has(id)) throw Object.assign(new Error('missing'), { code: 'resource_missing' }); return products.get(id); },
      create: async value => { const p = { ...value, active: true }; products.set(p.id, p); return p; },
      update: async (id, value) => { const p = { ...products.get(id), ...value }; products.set(id, p); updates.push(id); return p; },
    },
    coupons: {
      retrieve: async id => { if (!coupons.has(id)) throw Object.assign(new Error('missing'), { code: 'resource_missing' }); return coupons.get(id); },
      create: async ({ applies_to, expand, ...value }) => { const c = { ...value, valid: true, applies_to: { products: applies_to.products } }; coupons.set(c.id, c); return c; },
    },
    promotionCodes: {
      list: async ({ code }) => ({ data: promotions.filter(p => p.code.toUpperCase() === code.toUpperCase()) }),
      create: async value => { const p = { ...value, id: `promo_${promotions.length}`, active: true }; promotions.push(p); return p; },
    },
    billing: { meters: {
      list: async function* () { yield* meters; },
      create: async value => { const m = { ...value, id: `mtr_${meters.length}`, status: 'active' }; meters.push(m); return m; },
    } },
    prices: {
      list: async ({ lookup_keys }) => ({ data: prices.filter(p => lookup_keys.includes(p.lookup_key)) }),
      create: async value => { const p = { ...value, id: `price_${prices.length}`, active: true,
        recurring: { usage_type: 'licensed', ...value.recurring, interval_count: 1 } }; prices.push(p); return p; },
    },
  };
  return { client, products, prices, updates, uploads, coupons, promotions, meters };
}

test('setup reuses plans without duplicating resources', async () => {
  const { client, products, prices } = fakeStripe();
  const first = await setup(client);
  assert.deepEqual(await setup(client), first);
  assert.equal(products.size, 2);
  assert.equal(prices.length, 2);
  assert.deepEqual(prices.map(p => p.unit_amount), [4900, 19900]);
});

test('approved decimal overage rates match their units and AI allowances',async()=>{
 const {client,prices,products}=fakeStripe();
 const env={GUARDSCALE_SERVER_HOUR_CENTS:pricing.serverHourCents,GUARDSCALE_LOG_MB_CENTS:pricing.logMiBCents,GUARDSCALE_AI_CREDIT_CENTS:pricing.aiCreditCents};
 const first=await setup(client,undefined,env);assert.deepEqual(await setup(client,undefined,env),first);
 assert.deepEqual(prices.filter(p=>p.recurring.usage_type==='metered').map(p=>p.unit_amount_decimal),['2','0.15','0.3']);
 assert.equal(products.get('guardscale_starter_v1').metadata.included_ai_credits,'1000');
 assert.equal(products.get('guardscale_scale_v1').metadata.included_ai_credits,'5000');
 assert.match(products.get('guardscale_overage_log_mb_v1').description,/1,048,576/);
 assert.match(products.get('guardscale_overage_ai_credits_v1').description,/\$0.001/);
});

test('products get Checkout names, descriptions and one uploaded logo, updated in place on rerun', async () => {
  const { client, products, updates, uploads } = fakeStripe();
  products.set('guardscale_starter_v1', { id: 'guardscale_starter_v1', name: 'GuardScale starter', active: true, images: [] });
  await setup(client, { data: Buffer.from('png'), name: 'logo.png' });
  const starter = products.get('guardscale_starter_v1');
  assert.equal(starter.name, 'GuardScale Pro');
  assert.match(starter.description, /Up to 10 protected servers/);
  assert.deepEqual(starter.images, ['https://files.stripe.com/links/logo']);
  assert.equal(starter.metadata.logo_file, 'file_1');
  assert.deepEqual(uploads, ['business_logo'], 'logo uploaded once and reused');
  const before = updates.length;
  await setup(client, { data: Buffer.from('png'), name: 'logo.png' });
  assert.equal(updates.length, before, 'no updates when display is already current');
});

const dev50 = { GUARDSCALE_COUPON_CODE: 'GUARDSCALE_DEV50', GUARDSCALE_COUPON_PERCENT_OFF: '50', GUARDSCALE_COUPON_DURATION: '3' };

test('no coupon is created without coupon settings', async () => {
  const { client, coupons, promotions } = fakeStripe();
  assert.equal((await setup(client)).coupon, undefined);
  assert.equal(coupons.size + promotions.length, 0);
});

test('coupon and promotion code are created once, limited to GuardScale plans, and reused on rerun', async () => {
  const { client, coupons, promotions } = fakeStripe();
  const first = await setup(client, undefined, dev50);
  assert.deepEqual(first.coupon, { code: 'GUARDSCALE_DEV50', coupon: 'guardscale_guardscale_dev50', promotion_code: 'promo_0', percent_off: 50, duration: 'repeating', duration_in_months: 3, active: true });
  assert.deepEqual(coupons.get('guardscale_guardscale_dev50').applies_to.products, ['guardscale_starter_v1', 'guardscale_scale_v1']);
  assert.deepEqual(promotions[0].promotion, { type: 'coupon', coupon: 'guardscale_guardscale_dev50' });
  assert.deepEqual((await setup(client, undefined, dev50)).coupon, first.coupon);
  assert.equal(coupons.size, 1);
  assert.equal(promotions.length, 1);
});

test('changed terms, inactive or reassigned codes fail for manual review', async () => {
  const { client, promotions } = fakeStripe();
  await setup(client, undefined, dev50);
  await assert.rejects(setup(client, undefined, { ...dev50, GUARDSCALE_COUPON_PERCENT_OFF: '60' }), /Coupon conflict/);
  promotions[0].active = false;
  await assert.rejects(setup(client, undefined, dev50), /Promotion code conflict/);
  promotions[0].active = true;
  promotions[0].promotion.coupon = 'other_coupon';
  await assert.rejects(setup(client, undefined, dev50), /Promotion code conflict/);
});

test('incomplete or invalid coupon settings are rejected before any Stripe resource is created', async () => {
  const { client, coupons, products, prices } = fakeStripe();
  await assert.rejects(setup(client, undefined, { GUARDSCALE_COUPON_CODE: 'GUARDSCALE50' }), /PERCENT_OFF/);
  await assert.rejects(setup(client, undefined, { ...dev50, GUARDSCALE_COUPON_CODE: 'dev50' }), /uppercase/);
  await assert.rejects(setup(client, undefined, { ...dev50, GUARDSCALE_COUPON_PERCENT_OFF: '120' }), /PERCENT_OFF/);
  await assert.rejects(setup(client, undefined, { ...dev50, GUARDSCALE_COUPON_DURATION: '' }), /DURATION/);
  assert.equal(coupons.size + products.size + prices.length, 0);
});

test('usage meters are created once; overage prices are metered, only created with amounts, and reused on rerun', async () => {
  const { client, prices, meters } = fakeStripe();
  const plain = await setup(client);
  assert.deepEqual(meters.map(m => m.event_name), ['guardscale_server_hours_v1', 'guardscale_log_mb_v1', 'guardscale_ai_credits_v1']);
  assert.equal(plain.STRIPE_SERVER_OVERAGE_PRICE_ID, undefined);
  const amounts = { GUARDSCALE_SERVER_HOUR_CENTS: '1.5', GUARDSCALE_LOG_MB_CENTS: '0.05' };
  const first = await setup(client, undefined, amounts);
  const server = prices.find(p => p.id === first.STRIPE_SERVER_OVERAGE_PRICE_ID), log = prices.find(p => p.id === first.STRIPE_LOG_OVERAGE_PRICE_ID);
  assert.equal(server.recurring.usage_type, 'metered');
  assert.equal(server.recurring.meter, first.guardscale_server_hours_v1);
  assert.equal(server.unit_amount_decimal, '1.5');
  assert.equal(log.recurring.meter, first.guardscale_log_mb_v1);
  assert.equal(first.STRIPE_AI_OVERAGE_PRICE_ID, undefined);
  assert.deepEqual(await setup(client, undefined, amounts), first);
  assert.equal(meters.length, 3);
  meters[0].default_aggregation = { formula: 'count' };
  await assert.rejects(setup(client), /Meter conflict/);
});

test('invalid overage amounts are rejected before any Stripe resource is created', async () => {
  const { client, products, prices, meters } = fakeStripe();
  await assert.rejects(setup(client, undefined, { GUARDSCALE_LOG_MB_CENTS: 'abc' }), /Invalid GUARDSCALE_LOG_MB_CENTS/);
  assert.equal(products.size + prices.length + meters.length, 0);
});

test('plan products carry their included units, and reruns add missing unit metadata without other changes', async () => {
  const { client, products, updates } = fakeStripe();
  await setup(client);
  assert.deepEqual([products.get('guardscale_starter_v1').metadata.included_servers, products.get('guardscale_starter_v1').metadata.included_log_mb], ['10', '10000']);
  assert.deepEqual([products.get('guardscale_scale_v1').metadata.included_servers, products.get('guardscale_scale_v1').metadata.included_log_mb], ['50', '100000']);
  // A product created before log MB was attached gains it on the next run; other metadata is kept.
  const old = products.get('guardscale_starter_v1'); products.set(old.id, { ...old, metadata: { application: 'guardscale', included_servers: '5', logo_file: 'file_old' } });
  updates.length = 0; await setup(client);
  assert.deepEqual(products.get('guardscale_starter_v1').metadata, { application: 'guardscale', included_servers: '10', logo_file: 'file_old', included_log_mb: '10000', included_ai_credits: '1000' });
  assert.deepEqual(updates, ['guardscale_starter_v1']);
  updates.length = 0; await setup(client);
  assert.deepEqual(updates, [], 'nothing to change on a current rerun');
});
