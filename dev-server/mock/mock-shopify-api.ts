/**
 * Mock Shopify REST API for Data Hub integration testing.
 *
 * Simulates Shopify Admin API v2024-01 with:
 *   GET  /admin/api/2024-01/products.json           — Paginated product listing (cursor-based)
 *   GET  /admin/api/2024-01/products/:id.json       — Product detail with variants
 *   GET  /admin/api/2024-01/variants/:id.json       — Variant detail
 *   GET  /admin/api/2024-01/collections.json        — Smart and custom collections
 *   GET  /admin/api/2024-01/customers.json          — Customer listing
 *   GET  /admin/api/2024-01/orders.json             — Order listing
 *   GET  /admin/api/2024-01/inventory_levels.json   — Stock levels per location
 *   POST /admin/api/2024-01/webhooks.json           — Register webhook
 *   POST /webhooks/product/create                   — Webhook delivery endpoint
 *   GET  /admin/api/2024-01/shop.json               — Shop info
 *
 * Features:
 * - Cursor-based pagination with Link headers
 * - Rate limiting: 2 requests/second (leaky bucket)
 * - Metafields on products
 * - Realistic Shopify data structure
 * - 1000 products with variants
 *
 * Run:  npx ts-node dev-server/mock/mock-shopify-api.ts
 */
import express from 'express';
import crypto from 'crypto';
import { MOCK_PORTS } from '../ports';

const app = express();
app.use(express.json());

// ── Configuration ────────────────────────────────────────────────────────────
const PORT = MOCK_PORTS.SHOPIFY;
const API_VERSION = '2024-01';
const BASE_PATH = `/admin/api/${API_VERSION}`;
const ACCESS_TOKEN = 'shpat_test_mock_access_token_123456';
const RATE_LIMIT_PER_SECOND = 2;
const PAGE_SIZE = 50;

// ── Rate Limiting (Leaky Bucket) ─────────────────────────────────────────────
interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

const rateLimits = new Map<string, RateLimitBucket>();

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  let bucket = rateLimits.get(clientId);

  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_PER_SECOND, lastRefill: now };
    rateLimits.set(clientId, bucket);
  }

  // Refill tokens
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(RATE_LIMIT_PER_SECOND, bucket.tokens + elapsed * RATE_LIMIT_PER_SECOND);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  return false;
}

// ── Authentication & Middleware ──────────────────────────────────────────────
function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers['x-shopify-access-token'];

  if (token !== ACCESS_TOKEN) {
    res.status(401).json({ errors: 'Unauthorized' });
    return;
  }

  const clientId = req.ip || 'unknown';
  if (!checkRateLimit(clientId)) {
    res.status(429).json({
      errors: 'Throttled',
      message: 'Exceeded 2 requests per second'
    });
    return;
  }

  next();
}

app.use(BASE_PATH, authenticate);

// ── Data Generation ──────────────────────────────────────────────────────────
interface ShopifyMetafield {
  id: number;
  namespace: string;
  key: string;
  value: string;
  type: string;
}

interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
  position: number;
  inventory_policy: 'deny' | 'continue';
  compare_at_price: string | null;
  fulfillment_service: string;
  inventory_management: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  created_at: string;
  updated_at: string;
  taxable: boolean;
  barcode: string | null;
  grams: number;
  image_id: number | null;
  weight: number;
  weight_unit: string;
  inventory_item_id: number;
  inventory_quantity: number;
  old_inventory_quantity: number;
  requires_shipping: boolean;
}

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  created_at: string;
  handle: string;
  updated_at: string;
  published_at: string;
  template_suffix: string | null;
  status: 'active' | 'archived' | 'draft';
  published_scope: string;
  tags: string;
  admin_graphql_api_id: string;
  variants: ShopifyVariant[];
  options: Array<{ id: number; product_id: number; name: string; position: number; values: string[] }>;
  images: Array<{ id: number; product_id: number; position: number; src: string; variant_ids: number[] }>;
  image: { id: number; product_id: number; position: number; src: string } | null;
  metafields?: ShopifyMetafield[];
}

interface ShopifyCollection {
  id: number;
  handle: string;
  title: string;
  updated_at: string;
  body_html: string;
  published_at: string;
  sort_order: string;
  template_suffix: string | null;
  published_scope: string;
  admin_graphql_api_id: string;
}

interface ShopifyCustomer {
  id: number;
  email: string;
  accepts_marketing: boolean;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  orders_count: number;
  state: string;
  total_spent: string;
  last_order_id: number | null;
  note: string | null;
  verified_email: boolean;
  multipass_identifier: string | null;
  tax_exempt: boolean;
  phone: string;
  tags: string;
  last_order_name: string | null;
  currency: string;
  addresses: Array<{
    id: number;
    customer_id: number;
    first_name: string;
    last_name: string;
    company: string | null;
    address1: string;
    address2: string | null;
    city: string;
    province: string;
    country: string;
    zip: string;
    phone: string;
    name: string;
    province_code: string;
    country_code: string;
    country_name: string;
    default: boolean;
  }>;
  admin_graphql_api_id: string;
  default_address?: any;
}

interface ShopifyOrder {
  id: number;
  email: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  number: number;
  note: string | null;
  token: string;
  gateway: string;
  test: boolean;
  total_price: string;
  subtotal_price: string;
  total_weight: number;
  total_tax: string;
  taxes_included: boolean;
  currency: string;
  financial_status: string;
  confirmed: boolean;
  total_discounts: string;
  buyer_accepts_marketing: boolean;
  name: string;
  referring_site: string;
  landing_site: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  reference: string | null;
  user_id: number | null;
  location_id: number | null;
  source_identifier: string | null;
  source_url: string | null;
  device_id: number | null;
  phone: string | null;
  customer_locale: string;
  app_id: number;
  browser_ip: string;
  landing_site_ref: string | null;
  order_number: number;
  line_items: Array<{
    id: number;
    variant_id: number;
    title: string;
    quantity: number;
    sku: string;
    variant_title: string;
    vendor: string;
    fulfillment_service: string;
    product_id: number;
    requires_shipping: boolean;
    taxable: boolean;
    gift_card: boolean;
    name: string;
    properties: any[];
    product_exists: boolean;
    fulfillable_quantity: number;
    grams: number;
    price: string;
    total_discount: string;
    fulfillment_status: string | null;
  }>;
  customer: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
}

// Generate sample data
const vendors = ['Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance', 'Under Armour', 'Asics', 'Converse'];
const productTypes = ['Shoes', 'T-Shirt', 'Hoodie', 'Shorts', 'Jacket', 'Pants', 'Hat', 'Bag'];
const colors = ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Gray', 'Navy'];
const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const products: ShopifyProduct[] = [];
const collections: ShopifyCollection[] = [];
const customers: ShopifyCustomer[] = [];
const orders: ShopifyOrder[] = [];

// Generate 1000 products
for (let i = 1; i <= 1000; i++) {
  const vendor = vendors[i % vendors.length];
  const productType = productTypes[i % productTypes.length];
  const title = `${vendor} ${productType} #${i}`;
  const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const createdAt = new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString();
  const updatedAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();

  // Generate 2-6 variants per product
  const variantCount = 2 + Math.floor(Math.random() * 5);
  const variants: ShopifyVariant[] = [];
  const imageIds: number[] = [];

  for (let v = 0; v < variantCount; v++) {
    const variantId = i * 100 + v;
    const color = colors[v % colors.length];
    const size = sizes[v % sizes.length];
    const price = (19.99 + Math.random() * 180).toFixed(2);
    const imageId = variantId * 10;
    imageIds.push(imageId);

    variants.push({
      id: variantId,
      product_id: i,
      title: `${color} / ${size}`,
      price,
      sku: `SKU-${i}-${v}`,
      position: v + 1,
      inventory_policy: 'deny',
      compare_at_price: Math.random() > 0.5 ? (parseFloat(price) * 1.2).toFixed(2) : null,
      fulfillment_service: 'manual',
      inventory_management: 'shopify',
      option1: color,
      option2: size,
      option3: null,
      created_at: createdAt,
      updated_at: updatedAt,
      taxable: true,
      barcode: `BAR${variantId}`,
      grams: 500 + Math.floor(Math.random() * 1000),
      image_id: imageId,
      weight: 0.5 + Math.random(),
      weight_unit: 'kg',
      inventory_item_id: variantId * 1000,
      inventory_quantity: Math.floor(Math.random() * 100),
      old_inventory_quantity: Math.floor(Math.random() * 100),
      requires_shipping: true,
    });
  }

  const images = variants.map((v, idx) => ({
    id: v.image_id!,
    product_id: i,
    position: idx + 1,
    src: `https://cdn.shopify.com/products/${i}-${idx}.jpg`,
    variant_ids: [v.id],
  }));

  products.push({
    id: i,
    title,
    body_html: `<p>High quality ${productType.toLowerCase()} from ${vendor}. Perfect for everyday wear.</p>`,
    vendor,
    product_type: productType,
    created_at: createdAt,
    handle,
    updated_at: updatedAt,
    published_at: createdAt,
    template_suffix: null,
    status: Math.random() > 0.1 ? 'active' : 'draft',
    published_scope: 'web',
    tags: `${vendor}, ${productType}, Featured`,
    admin_graphql_api_id: `gid://shopify/Product/${i}`,
    variants,
    options: [
      { id: i * 10, product_id: i, name: 'Color', position: 1, values: colors.slice(0, variantCount) },
      { id: i * 10 + 1, product_id: i, name: 'Size', position: 2, values: sizes.slice(0, variantCount) },
    ],
    images,
    image: images[0] || null,
    metafields: [
      {
        id: i * 100,
        namespace: 'custom',
        key: 'material',
        value: Math.random() > 0.5 ? 'Cotton' : 'Polyester',
        type: 'single_line_text_field',
      },
      {
        id: i * 100 + 1,
        namespace: 'custom',
        key: 'care_instructions',
        value: 'Machine wash cold, tumble dry low',
        type: 'single_line_text_field',
      },
    ],
  });
}

// Generate 20 collections
for (let i = 1; i <= 20; i++) {
  const vendor = vendors[i % vendors.length];
  const title = `${vendor} Collection`;
  const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  collections.push({
    id: i,
    handle,
    title,
    updated_at: new Date().toISOString(),
    body_html: `<p>Browse our ${vendor} products</p>`,
    published_at: new Date().toISOString(),
    sort_order: 'best-selling',
    template_suffix: null,
    published_scope: 'web',
    admin_graphql_api_id: `gid://shopify/Collection/${i}`,
  });
}

// Generate 100 customers
for (let i = 1; i <= 100; i++) {
  const firstName = `Customer${i}`;
  const lastName = `Test`;
  const email = `customer${i}@example.com`;
  const createdAt = new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString();

  customers.push({
    id: i,
    email,
    accepts_marketing: Math.random() > 0.5,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
    first_name: firstName,
    last_name: lastName,
    orders_count: Math.floor(Math.random() * 10),
    state: 'enabled',
    total_spent: (Math.random() * 1000).toFixed(2),
    last_order_id: null,
    note: null,
    verified_email: true,
    multipass_identifier: null,
    tax_exempt: false,
    phone: `+1555${String(i).padStart(7, '0')}`,
    tags: Math.random() > 0.5 ? 'VIP' : '',
    last_order_name: null,
    currency: 'USD',
    addresses: [
      {
        id: i * 10,
        customer_id: i,
        first_name: firstName,
        last_name: lastName,
        company: null,
        address1: `${i} Main Street`,
        address2: null,
        city: 'New York',
        province: 'New York',
        country: 'United States',
        zip: '10001',
        phone: `+1555${String(i).padStart(7, '0')}`,
        name: `${firstName} ${lastName}`,
        province_code: 'NY',
        country_code: 'US',
        country_name: 'United States',
        default: true,
      },
    ],
    admin_graphql_api_id: `gid://shopify/Customer/${i}`,
  });
}

// Generate 200 orders
for (let i = 1; i <= 200; i++) {
  const customer = customers[i % customers.length];
  const createdAt = new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000).toISOString();
  const lineItemCount = 1 + Math.floor(Math.random() * 4);
  const lineItems: any[] = [];
  let totalPrice = 0;

  for (let l = 0; l < lineItemCount; l++) {
    const product = products[Math.floor(Math.random() * products.length)];
    const variant = product.variants[Math.floor(Math.random() * product.variants.length)];
    const quantity = 1 + Math.floor(Math.random() * 3);
    const price = parseFloat(variant.price);
    totalPrice += price * quantity;

    lineItems.push({
      id: i * 100 + l,
      variant_id: variant.id,
      title: product.title,
      quantity,
      sku: variant.sku,
      variant_title: variant.title,
      vendor: product.vendor,
      fulfillment_service: 'manual',
      product_id: product.id,
      requires_shipping: true,
      taxable: true,
      gift_card: false,
      name: `${product.title} - ${variant.title}`,
      properties: [],
      product_exists: true,
      fulfillable_quantity: quantity,
      grams: variant.grams,
      price: variant.price,
      total_discount: '0.00',
      fulfillment_status: null,
    });
  }

  const tax = totalPrice * 0.08;

  orders.push({
    id: i,
    email: customer.email,
    closed_at: null,
    created_at: createdAt,
    updated_at: createdAt,
    number: i,
    note: null,
    token: crypto.randomBytes(16).toString('hex'),
    gateway: 'manual',
    test: false,
    total_price: (totalPrice + tax).toFixed(2),
    subtotal_price: totalPrice.toFixed(2),
    total_weight: lineItems.reduce((sum, item) => sum + item.grams * item.quantity, 0),
    total_tax: tax.toFixed(2),
    taxes_included: false,
    currency: 'USD',
    financial_status: 'paid',
    confirmed: true,
    total_discounts: '0.00',
    buyer_accepts_marketing: customer.accepts_marketing,
    name: `#${i}`,
    referring_site: '',
    landing_site: '',
    cancelled_at: null,
    cancel_reason: null,
    reference: null,
    user_id: null,
    location_id: null,
    source_identifier: null,
    source_url: null,
    device_id: null,
    phone: null,
    customer_locale: 'en',
    app_id: 580111,
    browser_ip: '192.168.1.1',
    landing_site_ref: null,
    order_number: 1000 + i,
    line_items: lineItems,
    customer: {
      id: customer.id,
      email: customer.email,
      first_name: customer.first_name,
      last_name: customer.last_name,
    },
  });
}

// ── Pagination Helpers ───────────────────────────────────────────────────────
function encodeCursor(value: any): string {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

function decodeCursor(cursor: string): any {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString());
  } catch {
    return null;
  }
}

function paginateArray<T extends { id: number }>(
  items: T[],
  limit: number,
  sinceId?: number,
  cursor?: string
): { data: T[]; hasNext: boolean; nextCursor?: string; linkHeader?: string } {
  let startIdx = 0;

  if (cursor) {
    const cursorData = decodeCursor(cursor);
    if (cursorData?.id) {
      startIdx = items.findIndex(item => item.id === cursorData.id) + 1;
    }
  } else if (sinceId) {
    startIdx = items.findIndex(item => item.id > sinceId);
    if (startIdx === -1) startIdx = items.length;
  }

  const data = items.slice(startIdx, startIdx + limit);
  const hasNext = startIdx + limit < items.length;
  const nextCursor = hasNext && data.length > 0 ? encodeCursor({ id: data[data.length - 1].id }) : undefined;

  return { data, hasNext, nextCursor };
}

function buildLinkHeader(req: express.Request, nextCursor?: string): string | undefined {
  if (!nextCursor) return undefined;

  const url = new URL(`http://${req.headers.host}${req.originalUrl}`);
  url.searchParams.set('page_info', nextCursor);

  return `<${url.toString()}>; rel="next"`;
}

// ── API Endpoints ────────────────────────────────────────────────────────────

// Shop info
app.get(`${BASE_PATH}/shop.json`, (req, res) => {
  res.json({
    shop: {
      id: 1,
      name: 'Mock Shopify Store',
      email: 'admin@mockshopify.com',
      domain: 'mock-shopify.myshopify.com',
      province: 'New York',
      country: 'US',
      address1: '123 Commerce Street',
      zip: '10001',
      city: 'New York',
      phone: '+1-555-0100',
      created_at: '2020-01-01T00:00:00Z',
      currency: 'USD',
      timezone: 'America/New_York',
      iana_timezone: 'America/New_York',
      shop_owner: 'Mock Owner',
      money_format: '${{amount}}',
      money_with_currency_format: '${{amount}} USD',
      weight_unit: 'kg',
      province_code: 'NY',
      taxes_included: false,
      tax_shipping: null,
      county_taxes: true,
      plan_display_name: 'Shopify Plus',
      plan_name: 'plus',
      has_discounts: true,
      has_gift_cards: true,
      myshopify_domain: 'mock-shopify.myshopify.com',
      google_apps_domain: null,
      google_apps_login_enabled: null,
      money_in_emails_format: '${{amount}}',
      money_with_currency_in_emails_format: '${{amount}} USD',
      eligible_for_payments: true,
      requires_extra_payments_agreement: false,
      password_enabled: false,
      has_storefront: true,
      eligible_for_card_reader_giveaway: false,
      finances: true,
      primary_locale: 'en',
      cookie_consent_level: 'implied',
      multi_location_enabled: true,
      setup_required: false,
      pre_launch_enabled: false,
      enabled_presentment_currencies: ['USD'],
    },
  });
});

// Products list
app.get(`${BASE_PATH}/products.json`, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || PAGE_SIZE, 250);
  const sinceId = parseInt(req.query.since_id as string) || undefined;
  const cursor = req.query.page_info as string;
  const includeMetafields = req.query.fields?.toString().includes('metafields');

  const { data, hasNext, nextCursor } = paginateArray(products, limit, sinceId, cursor);

  const productsData = includeMetafields
    ? data
    : data.map(p => {
        const { metafields, ...rest } = p;
        return rest;
      });

  const linkHeader = buildLinkHeader(req, nextCursor);
  if (linkHeader) {
    res.setHeader('Link', linkHeader);
  }

  res.json({ products: productsData });
});

// Single product
app.get(`${BASE_PATH}/products/:id.json`, (req, res) => {
  const id = parseInt(req.params.id);
  const product = products.find(p => p.id === id);

  if (!product) {
    res.status(404).json({ errors: 'Not Found' });
    return;
  }

  res.json({ product });
});

// Single variant
app.get(`${BASE_PATH}/variants/:id.json`, (req, res) => {
  const id = parseInt(req.params.id);

  for (const product of products) {
    const variant = product.variants.find(v => v.id === id);
    if (variant) {
      res.json({ variant });
      return;
    }
  }

  res.status(404).json({ errors: 'Not Found' });
});

// Collections
app.get(`${BASE_PATH}/collections.json`, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || PAGE_SIZE, 250);
  const sinceId = parseInt(req.query.since_id as string) || undefined;
  const cursor = req.query.page_info as string;

  const { data, hasNext, nextCursor } = paginateArray(collections, limit, sinceId, cursor);

  const linkHeader = buildLinkHeader(req, nextCursor);
  if (linkHeader) {
    res.setHeader('Link', linkHeader);
  }

  res.json({ collections: data });
});

// Customers
app.get(`${BASE_PATH}/customers.json`, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || PAGE_SIZE, 250);
  const sinceId = parseInt(req.query.since_id as string) || undefined;
  const cursor = req.query.page_info as string;

  const { data, hasNext, nextCursor } = paginateArray(customers, limit, sinceId, cursor);

  const linkHeader = buildLinkHeader(req, nextCursor);
  if (linkHeader) {
    res.setHeader('Link', linkHeader);
  }

  res.json({ customers: data });
});

// Orders
app.get(`${BASE_PATH}/orders.json`, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || PAGE_SIZE, 250);
  const sinceId = parseInt(req.query.since_id as string) || undefined;
  const cursor = req.query.page_info as string;
  const status = req.query.status as string;

  let filteredOrders = orders;
  if (status === 'open') {
    filteredOrders = orders.filter(o => !o.closed_at);
  } else if (status === 'closed') {
    filteredOrders = orders.filter(o => o.closed_at);
  }

  const { data, hasNext, nextCursor } = paginateArray(filteredOrders, limit, sinceId, cursor);

  const linkHeader = buildLinkHeader(req, nextCursor);
  if (linkHeader) {
    res.setHeader('Link', linkHeader);
  }

  res.json({ orders: data });
});

// Inventory levels
app.get(`${BASE_PATH}/inventory_levels.json`, (req, res) => {
  const inventoryLevels: any[] = [];

  for (const product of products.slice(0, 100)) {
    for (const variant of product.variants) {
      inventoryLevels.push({
        inventory_item_id: variant.inventory_item_id,
        location_id: 1,
        available: variant.inventory_quantity,
        updated_at: product.updated_at,
      });
    }
  }

  res.json({ inventory_levels: inventoryLevels.slice(0, 250) });
});

// Webhooks registration (mock)
const registeredWebhooks: any[] = [];

app.post(`${BASE_PATH}/webhooks.json`, (req, res) => {
  const { webhook } = req.body;

  if (!webhook?.topic || !webhook?.address) {
    res.status(422).json({ errors: { topic: ['is required'], address: ['is required'] } });
    return;
  }

  const newWebhook = {
    id: registeredWebhooks.length + 1,
    address: webhook.address,
    topic: webhook.topic,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    format: webhook.format || 'json',
    fields: webhook.fields || [],
    metafield_namespaces: webhook.metafield_namespaces || [],
    api_version: API_VERSION,
  };

  registeredWebhooks.push(newWebhook);

  res.status(201).json({ webhook: newWebhook });
});

app.get(`${BASE_PATH}/webhooks.json`, (req, res) => {
  res.json({ webhooks: registeredWebhooks });
});

// Webhook delivery endpoint (for testing)
app.post('/webhooks/:topic', (req, res) => {
  console.log(`[WEBHOOK] Received: ${req.params.topic}`, {
    headers: req.headers,
    body: req.body,
  });

  res.status(200).json({ received: true });
});

// ── Server Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✓ Mock Shopify API listening on http://localhost:${PORT}`);
  console.log(`  API Base:     ${BASE_PATH}`);
  console.log(`  Access Token: ${ACCESS_TOKEN}`);
  console.log(`  Products:     ${products.length}`);
  console.log(`  Collections:  ${collections.length}`);
  console.log(`  Customers:    ${customers.length}`);
  console.log(`  Orders:       ${orders.length}`);
  console.log(`  Rate Limit:   ${RATE_LIMIT_PER_SECOND} req/sec\n`);
  console.log(`Example requests:`);
  console.log(`  curl -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" http://localhost:${PORT}${BASE_PATH}/products.json?limit=10`);
  console.log(`  curl -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" http://localhost:${PORT}${BASE_PATH}/shop.json\n`);
});
