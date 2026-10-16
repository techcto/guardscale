import { readFileSync } from 'node:fs';
import Stripe from 'stripe';

export const plans = [
  { id: 'starter', name: 'GuardScale Starter', cents: 4900, servers: 5, env: 'STRIPE_STARTER_PRICE_ID' },
  { id: 'scale', name: 'GuardScale Scale', cents: 19900, servers: 50, env: 'STRIPE_SCALE_PRICE_ID' },
];
// Shown in the Checkout order summary. Keep descriptions factual: what the plan includes, nothing promised beyond the app.
const describe = servers => `Up to ${servers} protected servers: Apache and PHP attack detection, incident timelines with evidence, live activity and log streams, and alert notifications. Cancel anytime.`;
// Optional percent-off coupon with one customer-facing promotion code, redeemed on Stripe Checkout. Supplied at run time,
// never committed: this repository is public. Use different codes in test and live mode.
export const couponEnv = ['GUARDSCALE_COUPON_CODE', 'GUARDSCALE_COUPON_PERCENT_OFF', 'GUARDSCALE_COUPON_DURATION'];

// Creates or reuses a product and keeps its Checkout display (name, description, image) current. Prices are never changed here.
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
  if (product.name !== display.name || product.description !== display.description || logo)
    product = await client.products.update(id, { ...display, ...(logo ? { images: [logo.url], metadata: { ...product.metadata, logo_file: logo.file } } : {}) });
  return product;
}

// image: optional { data, name } uploaded once to Stripe and used as the product image via a public file link.
// env: optional coupon settings (couponEnv); no coupon is created without them.
export async function setup(client, image, env = {}) {
  // Invalid coupon settings fail before any Stripe call, so plans are not touched either.
  const coupon = couponTerms(env);
  const output = {};let imageUrl;
  const productImage = image && (async () => imageUrl ??= await (async () => { const file = (await client.files.create({ purpose: 'business_logo', file: { data: image.data, name: image.name, type: 'application/octet-stream' } })).id; return { file, url: (await client.fileLinks.create({ file })).url }; })());
  for (const plan of plans) {
    const id = `guardscale_${plan.id}_v1`;
    await ensureProduct(client, id, { name: plan.name, description: describe(plan.servers) }, { application: 'guardscale', included_servers: String(plan.servers) }, productImage);
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
  if (!args.includes('--apply')) console.log(JSON.stringify({ mode: 'offline preview', plans, coupon: couponEnv.some(name => process.env[name]) ? Object.fromEntries(couponEnv.map(name => [name, process.env[name] ?? ''])) : 'none; set ' + couponEnv.join(', ') }, null, 2));
  else {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || !/^(sk|rk)_(test|live)_/.test(key)) throw new Error('A Stripe secret or restricted key is required');
    if (key.includes('_live_') && !args.includes('--live')) throw new Error('Live setup requires --apply --live');
    const logo = new URL('../../public/guardscale-logo-marketplace-640.png', import.meta.url);
    console.log(JSON.stringify(await setup(new Stripe(key), { data: readFileSync(logo), name: 'guardscale-logo.png' }, process.env), null, 2));
  }
}
