import { readFileSync } from 'node:fs';
import Stripe from 'stripe';
import pricing from '../../src/lib/billing-pricing.json' with {type:'json'};

export const plans = [
  { id: 'starter', name: 'GuardScale Starter', cents: 4900, servers: 5, logMb: 10000, aiCredits: pricing.includedAiCredits.starter, env: 'STRIPE_STARTER_PRICE_ID' },
  { id: 'scale', name: 'GuardScale Scale', cents: 19900, servers: 50, logMb: 100000, aiCredits: pricing.includedAiCredits.scale, env: 'STRIPE_SCALE_PRICE_ID' },
];
// Shown in the Checkout order summary. Keep descriptions factual: what the plan includes, nothing promised beyond the app.
const describe = servers => `Up to ${servers} protected servers: Apache and PHP attack detection, incident timelines with evidence, live activity and log streams, and alert notifications. Cancel anytime.`;
// Usage meters (sum of integer values per customer) and their overage prices, billed only above the plan allowance.
export const meters = ['guardscale_server_hours_v1', 'guardscale_log_mb_v1', 'guardscale_ai_credits_v1'];
// Per-unit overage prices on the meters, created only when an amount (USD cents, decimals allowed) is supplied at run time.
export const overage = [
  { id: 'server_hours', name: 'GuardScale extra server-hours', description: 'Per server-hour beyond the servers in your plan, only after you opt in. Billed monthly in arrears.', meter: 'guardscale_server_hours_v1', env: 'STRIPE_SERVER_OVERAGE_PRICE_ID', amountEnv: 'GUARDSCALE_SERVER_HOUR_CENTS' },
  { id: 'log_mb', name: 'GuardScale log ingestion', description: 'Per MiB (1,048,576 bytes) of log events beyond your allowance, including accounting overhead and 7-day retention, only after opt-in. Billed monthly in arrears.', meter: 'guardscale_log_mb_v1', env: 'STRIPE_LOG_OVERAGE_PRICE_ID', amountEnv: 'GUARDSCALE_LOG_MB_CENTS' },
  { id: 'ai_credits', name: 'GuardScale Guardian AI credits', description: 'Per credit beyond your allowance; one credit represents $0.001 of model inference cost using versioned token weights. Opt-in only; billed monthly in arrears.', meter: 'guardscale_ai_credits_v1', env: 'STRIPE_AI_OVERAGE_PRICE_ID', amountEnv: 'GUARDSCALE_AI_CREDIT_CENTS' },
];
// Optional percent-off coupon with one customer-facing promotion code, redeemed on Stripe Checkout. Supplied at run time,
// never committed: this repository is public. Use different codes in test and live mode.
export const couponEnv = ['GUARDSCALE_COUPON_CODE', 'GUARDSCALE_COUPON_PERCENT_OFF', 'GUARDSCALE_COUPON_DURATION'];

// Creates or reuses a product and keeps its Checkout display (name, description, image) and included-unit metadata current. Prices are never changed here.
async function ensureProduct(client, id, display, metadata, image) {
  let product;
  try { product = await client.products.retrieve(id); }
  catch (error) {
    if (error.code !== 'resource_missing') throw error;
    product = await client.products.create({ id, ...display, metadata }, { idempotencyKey: `${id}_create` });
  }
  if (product.deleted || !product.active) throw new Error(`Unavailable product: ${id}`);
  // Checkout branding needs the logo as a Stripe file ID (logo_file); the product image needs its public link.
  const logo = product.images?.length && product.metadata?.logo_file ? undefined : await image?.();
  const units = Object.fromEntries(Object.entries(metadata).filter(([key, value]) => key.startsWith('included_') && product.metadata?.[key] !== value));
  if (product.name !== display.name || product.description !== display.description || logo || Object.keys(units).length)
    product = await client.products.update(id, { ...display, ...(logo || Object.keys(units).length ? { metadata: { ...product.metadata, ...units, ...(logo ? { logo_file: logo.file } : {}) } } : {}), ...(logo ? { images: [logo.url] } : {}) });
  return product;
}

// image: optional { data, name } uploaded once to Stripe and used as the product image via a public file link.
// env: optional overage amounts and coupon settings; no overage price or coupon is created without them.
export async function setup(client, image, env = {}) {
  // Invalid coupon or overage settings fail before any Stripe call, so plans are not touched either.
  const coupon = couponTerms(env);
  for (const o of overage) if (env[o.amountEnv] && !/^\d{1,6}(\.\d{1,12})?$/.test(env[o.amountEnv])) throw new Error(`Invalid ${o.amountEnv}; use USD cents, e.g. 0.5`);
  const output = {};let imageUrl;
  const productImage = image && (async () => imageUrl ??= await (async () => { const file = (await client.files.create({ purpose: 'business_logo', file: { data: image.data, name: image.name, type: 'application/octet-stream' } })).id; return { file, url: (await client.fileLinks.create({ file })).url }; })());
  for (const plan of plans) {
    const id = `guardscale_${plan.id}_v1`;
    await ensureProduct(client, id, { name: plan.name, description: describe(plan.servers) }, { application: 'guardscale', included_servers: String(plan.servers), included_log_mb: String(plan.logMb), included_ai_credits: String(plan.aiCredits) }, productImage);
    const lookup_key = `${id}_usd_monthly`;
    let price = (await client.prices.list({ lookup_keys: [lookup_key], limit: 2 })).data[0];
    if (price && (!price.active || price.product !== id || price.currency !== 'usd' ||
      price.unit_amount !== plan.cents || price.recurring?.interval !== 'month' ||
      price.recurring?.interval_count !== 1 || price.recurring?.usage_type !== 'licensed')) {
      throw new Error(`Price conflict: ${lookup_key}; review manually`);
    }
    if (!price) price = await client.prices.create({ product: id, currency: 'usd',
      unit_amount: plan.cents, recurring: { interval: 'month' }, lookup_key },
    { idempotencyKey: `${lookup_key}_create` });
    output[plan.env] = price.id;
  }
  const existing = [];
  for await (const meter of client.billing.meters.list({ limit: 100 })) existing.push(meter);
  for (const event_name of meters) {
    let meter = existing.find(item => item.event_name === event_name);
    if (meter && (meter.status !== 'active' || meter.default_aggregation.formula !== 'sum' ||
      meter.customer_mapping.type !== 'by_id' || meter.customer_mapping.event_payload_key !== 'stripe_customer_id' ||
      meter.value_settings.event_payload_key !== 'value')) throw new Error(`Meter conflict: ${event_name}`);
    if (!meter) meter = await client.billing.meters.create({ event_name, display_name: event_name,
      default_aggregation: { formula: 'sum' }, customer_mapping: { type: 'by_id', event_payload_key: 'stripe_customer_id' },
      value_settings: { event_payload_key: 'value' } }, { idempotencyKey: `${event_name}_create` });
    output[event_name] = meter.id;
  }
  for (const o of overage) {
    const amount = env[o.amountEnv];
    if (!amount) continue;
    const id = `guardscale_overage_${o.id}_v1`;
    await ensureProduct(client, id, { name: o.name, description: o.description }, { application: 'guardscale', meter: o.meter }, productImage);
    const lookup_key = `${id}_usd_metered_${amount.replace('.', '_')}`;
    let price = (await client.prices.list({ lookup_keys: [lookup_key], limit: 2 })).data[0];
    // stripe-node returns unit_amount_decimal as a Decimal object; compare its string form.
    if (price && (!price.active || price.product !== id || price.currency !== 'usd' || String(price.unit_amount_decimal) !== amount ||
      price.recurring?.usage_type !== 'metered' || price.recurring?.meter !== output[o.meter])) throw new Error(`Price conflict: ${lookup_key}; review manually`);
    if (!price) price = await client.prices.create({ product: id, currency: 'usd', unit_amount_decimal: amount,
      recurring: { interval: 'month', usage_type: 'metered', meter: output[o.meter] }, lookup_key }, { idempotencyKey: `${lookup_key}_create` });
    output[o.env] = price.id;
  }
  if (coupon) output.coupon = await ensureCoupon(client, coupon);
  return output;
}

// Validates coupon settings without touching Stripe; null when none are given.
function couponTerms(env) {
  if (!couponEnv.some(name => env[name])) return null;
  const [code, percent, duration] = couponEnv.map(name => env[name] ?? '');
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new Error('GUARDSCALE_COUPON_CODE must be 3-40 uppercase letters, digits, _ or -');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(percent) || !(Number(percent) > 0 && Number(percent) <= 100)) throw new Error('GUARDSCALE_COUPON_PERCENT_OFF must be above 0 and at most 100');
  if (!/^(once|forever|[1-9]\d?)$/.test(duration)) throw new Error('GUARDSCALE_COUPON_DURATION must be once, forever or a number of months (1-99)');
  return { code, terms: { percent_off: Number(percent), ...(/^\d+$/.test(duration) ? { duration: 'repeating', duration_in_months: Number(duration) } : { duration }) } };
}

// Creates or reuses the coupon and its promotion code, then verifies both match the requested terms and are redeemable.
async function ensureCoupon(client, { code, terms }) {
  const id = `guardscale_${code.toLowerCase()}`, products = plans.map(plan => `guardscale_${plan.id}_v1`);
  let coupon;
  try { coupon = await client.coupons.retrieve(id, { expand: ['applies_to'] }); }
  catch (error) {
    if (error.code !== 'resource_missing') throw error;
    coupon = await client.coupons.create({ id, name: `GuardScale ${code}`, ...terms, applies_to: { products }, metadata: { application: 'guardscale' }, expand: ['applies_to'] }, { idempotencyKey: `${id}_create` });
  }
  if (!coupon.valid || coupon.percent_off !== terms.percent_off || coupon.duration !== terms.duration ||
    (coupon.duration_in_months ?? undefined) !== terms.duration_in_months ||
    products.some(product => !coupon.applies_to?.products?.includes(product))) throw new Error(`Coupon conflict: ${id}; review manually`);
  const matches = (await client.promotionCodes.list({ code, limit: 10 })).data;
  let promotion = matches.find(p => p.code === code);
  const couponOf = p => typeof p.promotion?.coupon === 'string' ? p.promotion.coupon : p.promotion?.coupon?.id;
  if (promotion && (!promotion.active || couponOf(promotion) !== id)) throw new Error(`Promotion code conflict: ${code}; review manually`);
  if (!promotion) promotion = await client.promotionCodes.create({ promotion: { type: 'coupon', coupon: id }, code, metadata: { application: 'guardscale' } }, { idempotencyKey: `${id}_promotion_create` });
  return { code, coupon: id, promotion_code: promotion.id, ...terms, active: promotion.active };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--apply', '--live'].includes(arg))) throw new Error('Usage: setup-plans.mjs [--apply [--live]]');
  if (!args.includes('--apply')) console.log(JSON.stringify({ mode: 'offline preview', plans, meters, overage, overages: 'metered prices only when GUARDSCALE_SERVER_HOUR_CENTS / GUARDSCALE_LOG_MB_CENTS / GUARDSCALE_AI_CREDIT_CENTS are set; export stays off until GUARDSCALE_USAGE_EXPORT=enabled', coupon: couponEnv.some(name => process.env[name]) ? Object.fromEntries(couponEnv.map(name => [name, process.env[name] ?? ''])) : 'none; set ' + couponEnv.join(', ') }, null, 2));
  else {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || !/^(sk|rk)_(test|live)_/.test(key)) throw new Error('A Stripe secret or restricted key is required');
    if (key.includes('_live_') && !args.includes('--live')) throw new Error('Live setup requires --apply --live');
    const logo = new URL('../../public/guardscale-logo-marketplace-640.png', import.meta.url);
    console.log(JSON.stringify(await setup(new Stripe(key), { data: readFileSync(logo), name: 'guardscale-logo.png' }, process.env), null, 2));
  }
}
