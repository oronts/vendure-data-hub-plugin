/**
 * Mock Magento REST API for Data Hub integration testing.
 *
 * Simulates Magento 2 REST API with:
 *   GET  /rest/V1/products                         — Product listing (offset pagination)
 *   GET  /rest/V1/products/:sku                    — Product detail
 *   GET  /rest/V1/categories                       — Category tree
 *   GET  /rest/V1/customers/search                 — Customer search
 *   GET  /rest/V1/orders                           — Order listing
 *   GET  /rest/V1/stockItems/:productId            — Stock item
 *   GET  /rest/V1/store/storeConfigs               — Store configurations
 *   POST /rest/V1/integration/admin/token          — Get admin token
 *
 * Features:
 * - Complex product types: simple, configurable, bundle, grouped
 * - EAV model (custom attributes)
 * - Multi-store/multi-website structure
 * - Offset-based pagination with search criteria
 * - Tier pricing and special prices
 * - Related products, upsells, cross-sells
 * - Category hierarchy with position
 * - 500 products, 100 categories
 *
 * Run:  npx ts-node dev-server/mock/mock-magento-api.ts
 */
import express from 'express';
import crypto from 'crypto';
import { MOCK_PORTS } from '../ports';

const app = express();
app.use(express.json());

// ── Configuration ────────────────────────────────────────────────────────────
const PORT = MOCK_PORTS.MAGENTO;
const BASE_PATH = '/rest/V1';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
const PAGE_SIZE = 20;

// ── Types ────────────────────────────────────────────────────────────────────
interface CustomAttribute {
  attribute_code: string;
  value: any;
}

interface TierPrice {
  customer_group_id: number;
  qty: number;
  value: number;
  extension_attributes?: any;
}

interface ProductLink {
  sku: string;
  link_type: 'related' | 'upsell' | 'crosssell';
  linked_product_sku: string;
  linked_product_type: string;
  position: number;
}

interface ConfigurableOption {
  id: number;
  attribute_id: number;
  label: string;
  position: number;
  values: Array<{
    value_index: number;
  }>;
  product_id: number;
}

interface MagentoProduct {
  id: number;
  sku: string;
  name: string;
  attribute_set_id: number;
  price: number;
  status: number; // 1 = enabled, 2 = disabled
  visibility: number; // 1 = not visible, 2 = catalog, 3 = search, 4 = catalog+search
  type_id: 'simple' | 'configurable' | 'bundle' | 'grouped';
  created_at: string;
  updated_at: string;
  weight?: number;
  extension_attributes?: {
    website_ids?: number[];
    category_links?: Array<{ position: number; category_id: string }>;
    stock_item?: {
      item_id: number;
      product_id: number;
      stock_id: number;
      qty: number;
      is_in_stock: boolean;
      is_qty_decimal: boolean;
      show_default_notification_message: boolean;
      use_config_min_qty: boolean;
      min_qty: number;
      use_config_min_sale_qty: number;
      min_sale_qty: number;
      use_config_max_sale_qty: boolean;
      max_sale_qty: number;
      use_config_backorders: boolean;
      backorders: number;
      use_config_notify_stock_qty: boolean;
      notify_stock_qty: number;
      use_config_qty_increments: boolean;
      qty_increments: number;
      use_config_enable_qty_inc: boolean;
      enable_qty_increments: boolean;
      use_config_manage_stock: boolean;
      manage_stock: boolean;
      low_stock_date: string | null;
      is_decimal_divided: boolean;
      stock_status_changed_auto: number;
    };
    configurable_product_options?: ConfigurableOption[];
    configurable_product_links?: number[];
    bundle_product_options?: any[];
  };
  product_links?: ProductLink[];
  options?: any[];
  media_gallery_entries?: Array<{
    id: number;
    media_type: string;
    label: string;
    position: number;
    disabled: boolean;
    types: string[];
    file: string;
  }>;
  tier_prices?: TierPrice[];
  custom_attributes: CustomAttribute[];
}

interface MagentoCategory {
  id: number;
  parent_id: number;
  name: string;
  is_active: boolean;
  position: number;
  level: number;
  product_count: number;
  children_data: MagentoCategory[];
  custom_attributes?: CustomAttribute[];
}

interface MagentoCustomer {
  id: number;
  group_id: number;
  created_at: string;
  updated_at: string;
  created_in: string;
  email: string;
  firstname: string;
  lastname: string;
  store_id: number;
  website_id: number;
  addresses: Array<{
    id: number;
    customer_id: number;
    region: { region_code: string; region: string; region_id: number };
    region_id: number;
    country_id: string;
    street: string[];
    telephone: string;
    postcode: string;
    city: string;
    firstname: string;
    lastname: string;
    default_shipping: boolean;
    default_billing: boolean;
  }>;
  disable_auto_group_change: number;
  extension_attributes?: {
    is_subscribed?: boolean;
  };
  custom_attributes?: CustomAttribute[];
}

interface MagentoOrder {
  entity_id: number;
  state: string;
  status: string;
  coupon_code: string | null;
  protect_code: string;
  shipping_description: string;
  is_virtual: number;
  store_id: number;
  customer_id: number;
  base_discount_amount: number;
  base_grand_total: number;
  base_shipping_amount: number;
  base_shipping_tax_amount: number;
  base_subtotal: number;
  base_tax_amount: number;
  base_total_paid: number;
  base_total_refunded: number;
  discount_amount: number;
  grand_total: number;
  shipping_amount: number;
  shipping_tax_amount: number;
  subtotal: number;
  tax_amount: number;
  total_paid: number;
  total_refunded: number;
  base_currency_code: string;
  global_currency_code: string;
  order_currency_code: string;
  store_currency_code: string;
  created_at: string;
  updated_at: string;
  items: Array<{
    item_id: number;
    order_id: number;
    quote_item_id: number;
    created_at: string;
    updated_at: string;
    product_id: number;
    product_type: string;
    sku: string;
    name: string;
    weight: number;
    qty_ordered: number;
    price: number;
    base_price: number;
    original_price: number;
    row_total: number;
    base_row_total: number;
  }>;
  billing_address: any;
  payment: any;
  status_histories: any[];
  extension_attributes?: any;
}

// ── Authentication ───────────────────────────────────────────────────────────
const STATIC_DEV_TOKEN = 'magento-dev-token-static-12345';
const tokens = new Map<string, { username: string; expiresAt: number }>();
// Pre-register a static dev token that never expires (for DataHub pipeline testing)
tokens.set(STATIC_DEV_TOKEN, { username: 'admin', expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000 });

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Skip auth for token endpoint
  if (req.path === '/integration/admin/token') {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Consumer is not authorized to access %resources' });
    return;
  }

  const token = authHeader.substring(7);
  const tokenData = tokens.get(token);

  if (!tokenData || tokenData.expiresAt < Date.now()) {
    res.status(401).json({ message: 'The consumer isn\'t authorized to access %resources.' });
    return;
  }

  next();
}

app.use(BASE_PATH, authenticate);

// Token endpoint (no auth required)
app.post(`${BASE_PATH}/integration/admin/token`, (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = generateToken();
    tokens.set(token, {
      username,
      expiresAt: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
    });

    res.json(token);
  } else {
    res.status(401).json({ message: 'The account sign-in was incorrect or your account is disabled temporarily. Please wait and try again later.' });
  }
});

// ── Data Generation ──────────────────────────────────────────────────────────
const categories: MagentoCategory[] = [];
const products: MagentoProduct[] = [];
const customers: MagentoCustomer[] = [];
const orders: MagentoOrder[] = [];

// Generate category tree
const rootCategories = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books'];
let categoryId = 1;

categories.push({
  id: categoryId++,
  parent_id: 0,
  name: 'Default Category',
  is_active: true,
  position: 0,
  level: 0,
  product_count: 0,
  children_data: [],
});

for (const rootName of rootCategories) {
  const rootId = categoryId++;
  const subcategories: MagentoCategory[] = [];

  // Generate 4 subcategories for each root
  for (let i = 1; i <= 4; i++) {
    const subId = categoryId++;
    subcategories.push({
      id: subId,
      parent_id: rootId,
      name: `${rootName} - Category ${i}`,
      is_active: true,
      position: i,
      level: 2,
      product_count: Math.floor(Math.random() * 50),
      children_data: [],
      custom_attributes: [
        { attribute_code: 'description', value: `${rootName} subcategory ${i}` },
        { attribute_code: 'meta_title', value: `${rootName} Category ${i}` },
      ],
    });
  }

  categories.push({
    id: rootId,
    parent_id: 1,
    name: rootName,
    is_active: true,
    position: categories.length,
    level: 1,
    product_count: subcategories.reduce((sum, c) => sum + c.product_count, 0),
    children_data: subcategories,
    custom_attributes: [
      { attribute_code: 'description', value: `Main ${rootName} category` },
      { attribute_code: 'meta_title', value: rootName },
    ],
  });

  categories.push(...subcategories);
}

// Generate products
const productTypes = ['simple', 'configurable', 'bundle', 'grouped'] as const;
const brands = ['BrandA', 'BrandB', 'BrandC', 'BrandD', 'BrandE'];
const colors = ['Red', 'Blue', 'Green', 'Black', 'White', 'Yellow'];
const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

for (let i = 1; i <= 500; i++) {
  const typeId = productTypes[i % productTypes.length];
  const brand = brands[i % brands.length];
  const categoryId = categories[Math.floor(Math.random() * (categories.length - 1)) + 1].id;
  const basePrice = 19.99 + Math.random() * 480;

  const product: MagentoProduct = {
    id: i,
    sku: `PROD-${String(i).padStart(5, '0')}`,
    name: `${brand} Product ${i}`,
    attribute_set_id: 4,
    price: parseFloat(basePrice.toFixed(2)),
    status: Math.random() > 0.1 ? 1 : 2, // 90% enabled
    visibility: 4, // Catalog + Search
    type_id: typeId,
    created_at: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    weight: parseFloat((Math.random() * 10).toFixed(2)),
    extension_attributes: {
      website_ids: [1],
      category_links: [{ position: 1, category_id: String(categoryId) }],
      stock_item: {
        item_id: i,
        product_id: i,
        stock_id: 1,
        qty: Math.floor(Math.random() * 200),
        is_in_stock: true,
        is_qty_decimal: false,
        show_default_notification_message: false,
        use_config_min_qty: true,
        min_qty: 0,
        use_config_min_sale_qty: 1,
        min_sale_qty: 1,
        use_config_max_sale_qty: true,
        max_sale_qty: 10000,
        use_config_backorders: true,
        backorders: 0,
        use_config_notify_stock_qty: true,
        notify_stock_qty: 1,
        use_config_qty_increments: true,
        qty_increments: 0,
        use_config_enable_qty_inc: true,
        enable_qty_increments: false,
        use_config_manage_stock: true,
        manage_stock: true,
        low_stock_date: null,
        is_decimal_divided: false,
        stock_status_changed_auto: 0,
      },
    },
    product_links: [],
    media_gallery_entries: [
      {
        id: i * 10,
        media_type: 'image',
        label: `${brand} Product ${i}`,
        position: 1,
        disabled: false,
        types: ['image', 'small_image', 'thumbnail'],
        file: `/catalog/product/${i}/main.jpg`,
      },
    ],
    tier_prices: Math.random() > 0.5 ? [
      { customer_group_id: 0, qty: 5, value: basePrice * 0.95 },
      { customer_group_id: 0, qty: 10, value: basePrice * 0.90 },
      { customer_group_id: 1, qty: 5, value: basePrice * 0.90 },
    ] : [],
    custom_attributes: [
      { attribute_code: 'brand', value: brand },
      { attribute_code: 'color', value: colors[i % colors.length] },
      { attribute_code: 'material', value: Math.random() > 0.5 ? 'Cotton' : 'Polyester' },
      { attribute_code: 'manufacturer', value: brand },
      { attribute_code: 'meta_title', value: `${brand} Product ${i}` },
      { attribute_code: 'meta_description', value: `High quality product from ${brand}` },
      { attribute_code: 'short_description', value: `${brand} product with excellent features` },
      { attribute_code: 'description', value: `<p>Detailed description of ${brand} Product ${i}. High quality materials and craftsmanship.</p>` },
    ],
  };

  // Add type-specific attributes
  if (typeId === 'configurable') {
    // Create simple products as children
    const childSkus: number[] = [];
    for (let j = 0; j < 3; j++) {
      const childId = 500 + i * 10 + j;
      childSkus.push(childId);
    }

    product.extension_attributes!.configurable_product_options = [
      {
        id: i * 100,
        attribute_id: 93, // color
        label: 'Color',
        position: 0,
        values: [
          { value_index: 1 },
          { value_index: 2 },
          { value_index: 3 },
        ],
        product_id: i,
      },
      {
        id: i * 100 + 1,
        attribute_id: 141, // size
        label: 'Size',
        position: 1,
        values: [
          { value_index: 1 },
          { value_index: 2 },
          { value_index: 3 },
        ],
        product_id: i,
      },
    ];
    product.extension_attributes!.configurable_product_links = childSkus;
  } else if (typeId === 'bundle') {
    product.extension_attributes!.bundle_product_options = [
      {
        option_id: i * 100,
        title: 'Bundle Option 1',
        required: true,
        type: 'select',
        position: 1,
        sku: product.sku,
        product_links: [],
      },
    ];
  }

  // Add related products
  if (i > 3) {
    product.product_links = [
      {
        sku: product.sku,
        link_type: 'related',
        linked_product_sku: `PROD-${String(i - 1).padStart(5, '0')}`,
        linked_product_type: 'simple',
        position: 1,
      },
      {
        sku: product.sku,
        link_type: 'upsell',
        linked_product_sku: `PROD-${String(i - 2).padStart(5, '0')}`,
        linked_product_type: 'simple',
        position: 1,
      },
    ];
  }

  products.push(product);
}

// Generate customers
for (let i = 1; i <= 100; i++) {
  customers.push({
    id: i,
    group_id: i % 4, // 4 customer groups
    created_at: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    created_in: 'Default Store View',
    email: `customer${i}@example.com`,
    firstname: `Customer${i}`,
    lastname: `Test`,
    store_id: 1,
    website_id: 1,
    addresses: [
      {
        id: i * 10,
        customer_id: i,
        region: { region_code: 'NY', region: 'New York', region_id: 43 },
        region_id: 43,
        country_id: 'US',
        street: [`${i} Main Street`],
        telephone: `555-${String(i).padStart(4, '0')}`,
        postcode: '10001',
        city: 'New York',
        firstname: `Customer${i}`,
        lastname: 'Test',
        default_shipping: true,
        default_billing: true,
      },
    ],
    disable_auto_group_change: 0,
    extension_attributes: {
      is_subscribed: Math.random() > 0.5,
    },
    custom_attributes: [
      { attribute_code: 'customer_type', value: 'retail' },
    ],
  });
}

// Generate orders
for (let i = 1; i <= 150; i++) {
  const customer = customers[i % customers.length];
  const itemCount = 1 + Math.floor(Math.random() * 4);
  const orderItems: any[] = [];
  let subtotal = 0;

  for (let j = 0; j < itemCount; j++) {
    const product = products[Math.floor(Math.random() * products.length)];
    const qty = 1 + Math.floor(Math.random() * 3);
    const price = product.price;
    const rowTotal = price * qty;
    subtotal += rowTotal;

    orderItems.push({
      item_id: i * 100 + j,
      order_id: i,
      quote_item_id: i * 100 + j,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      product_id: product.id,
      product_type: product.type_id,
      sku: product.sku,
      name: product.name,
      weight: product.weight || 0,
      qty_ordered: qty,
      price,
      base_price: price,
      original_price: price,
      row_total: rowTotal,
      base_row_total: rowTotal,
    });
  }

  const shippingAmount = 9.99;
  const taxRate = 0.08;
  const taxAmount = subtotal * taxRate;
  const grandTotal = subtotal + shippingAmount + taxAmount;

  orders.push({
    entity_id: i,
    state: Math.random() > 0.3 ? 'complete' : 'processing',
    status: Math.random() > 0.3 ? 'complete' : 'processing',
    coupon_code: null,
    protect_code: crypto.randomBytes(8).toString('hex'),
    shipping_description: 'Flat Rate - Fixed',
    is_virtual: 0,
    store_id: 1,
    customer_id: customer.id,
    base_discount_amount: 0,
    base_grand_total: grandTotal,
    base_shipping_amount: shippingAmount,
    base_shipping_tax_amount: 0,
    base_subtotal: subtotal,
    base_tax_amount: taxAmount,
    base_total_paid: grandTotal,
    base_total_refunded: 0,
    discount_amount: 0,
    grand_total: grandTotal,
    shipping_amount: shippingAmount,
    shipping_tax_amount: 0,
    subtotal,
    tax_amount: taxAmount,
    total_paid: grandTotal,
    total_refunded: 0,
    base_currency_code: 'USD',
    global_currency_code: 'USD',
    order_currency_code: 'USD',
    store_currency_code: 'USD',
    created_at: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    items: orderItems,
    billing_address: customer.addresses[0],
    payment: {
      method: 'checkmo',
      additional_information: ['Check / Money order'],
    },
    status_histories: [],
  });
}

// ── Pagination & Search Helpers ─────────────────────────────────────────────
function paginateWithSearchCriteria(items: any[], searchCriteria: any): any {
  const pageSize = searchCriteria.pageSize || PAGE_SIZE;
  const currentPage = searchCriteria.currentPage || 1;
  const offset = (currentPage - 1) * pageSize;

  const filteredItems = items; // TODO: apply filters
  const paginatedItems = filteredItems.slice(offset, offset + pageSize);

  return {
    items: paginatedItems,
    search_criteria: searchCriteria,
    total_count: filteredItems.length,
  };
}

// ── API Endpoints ────────────────────────────────────────────────────────────

// Store configs
app.get(`${BASE_PATH}/store/storeConfigs`, (req, res) => {
  res.json([
    {
      id: 1,
      code: 'default',
      website_id: 1,
      locale: 'en_US',
      base_currency_code: 'USD',
      default_display_currency_code: 'USD',
      timezone: 'America/New_York',
      weight_unit: 'lbs',
      base_url: 'http://localhost:3337/',
      base_link_url: 'http://localhost:3337/',
      base_static_url: 'http://localhost:3337/static/',
      base_media_url: 'http://localhost:3337/media/',
      secure_base_url: 'https://localhost:3337/',
    },
  ]);
});

// Products list
app.get(`${BASE_PATH}/products`, (req, res) => {
  const searchCriteria = req.query.searchCriteria || {};
  const result = paginateWithSearchCriteria(products, searchCriteria);
  res.json(result);
});

// Single product by SKU
app.get(`${BASE_PATH}/products/:sku`, (req, res) => {
  const product = products.find(p => p.sku === req.params.sku);

  if (!product) {
    res.status(404).json({ message: 'Requested product doesn\'t exist' });
    return;
  }

  res.json(product);
});

// Categories
app.get(`${BASE_PATH}/categories`, (req, res) => {
  // Return root category with full tree
  const rootCategory = categories[0];
  rootCategory.children_data = categories.filter(c => c.parent_id === rootCategory.id);

  res.json(rootCategory);
});

// Category by ID
app.get(`${BASE_PATH}/categories/:id`, (req, res) => {
  const id = parseInt(req.params.id);
  const category = categories.find(c => c.id === id);

  if (!category) {
    res.status(404).json({ message: 'Requested category doesn\'t exist' });
    return;
  }

  // Add children
  category.children_data = categories.filter(c => c.parent_id === category.id);

  res.json(category);
});

// Customers
app.get(`${BASE_PATH}/customers/search`, (req, res) => {
  const searchCriteria = req.query.searchCriteria || {};
  const result = paginateWithSearchCriteria(customers, searchCriteria);
  res.json(result);
});

// Orders
app.get(`${BASE_PATH}/orders`, (req, res) => {
  const searchCriteria = req.query.searchCriteria || {};
  const result = paginateWithSearchCriteria(orders, searchCriteria);
  res.json(result);
});

// Stock item
app.get(`${BASE_PATH}/stockItems/:productId`, (req, res) => {
  const productId = parseInt(req.params.productId);
  const product = products.find(p => p.id === productId);

  if (!product || !product.extension_attributes?.stock_item) {
    res.status(404).json({ message: 'Requested stock item doesn\'t exist' });
    return;
  }

  res.json(product.extension_attributes.stock_item);
});

// ── Server Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✓ Mock Magento API listening on http://localhost:${PORT}`);
  console.log(`  API Base:      ${BASE_PATH}`);
  console.log(`  Username:      ${ADMIN_USERNAME}`);
  console.log(`  Password:      ${ADMIN_PASSWORD}`);
  console.log(`  Products:      ${products.length}`);
  console.log(`  Categories:    ${categories.length}`);
  console.log(`  Customers:     ${customers.length}`);
  console.log(`  Orders:        ${orders.length}`);
  console.log(`\nProduct Types:`);
  const typeCounts = products.reduce((acc, p) => {
    acc[p.type_id] = (acc[p.type_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  Object.entries(typeCounts).forEach(([type, count]) => {
    console.log(`  ${type.padEnd(15)} ${count}`);
  });
  console.log(`\nExample requests:`);
  console.log(`  # Get token:`);
  console.log(`  TOKEN=$(curl -s -X POST http://localhost:${PORT}${BASE_PATH}/integration/admin/token \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"username":"${ADMIN_USERNAME}","password":"${ADMIN_PASSWORD}"}' | tr -d '"')`);
  console.log(`\n  # List products:`);
  console.log(`  curl -H "Authorization: Bearer $TOKEN" \\`);
  console.log(`    "http://localhost:${PORT}${BASE_PATH}/products?searchCriteria[pageSize]=10"`);
  console.log(`\n  # Get product by SKU:`);
  console.log(`  curl -H "Authorization: Bearer $TOKEN" \\`);
  console.log(`    http://localhost:${PORT}${BASE_PATH}/products/PROD-00001\n`);
});
