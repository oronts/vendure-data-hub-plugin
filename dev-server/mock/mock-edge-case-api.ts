/**
 * Mock Edge Case API Server
 *
 * Extended mock API that simulates various failure scenarios:
 * - Random 500 errors (configurable failure rate)
 * - Timeouts (configurable delay)
 * - Malformed JSON responses
 * - Rate limiting (429 errors)
 * - Partial failures (some records succeed, some fail)
 * - Progressive success (fail N times, then succeed)
 *
 * Usage:
 *   GET /api/products?failureRate=0.4      → 40% chance of 500 error
 *   GET /api/products?delay=5000           → 5 second delay before response
 *   GET /api/products?malformed=true       → Returns incomplete JSON
 *   GET /api/products?rateLimit=true       → Returns 429 after 3 requests
 *   GET /api/products?partialFail=0.3      → 30% of records will have errors
 *   GET /api/products?failUntilAttempt=4   → Fail 3 times, succeed on 4th
 */

import express from 'express';
import { MOCK_PORTS } from '../ports';

const app = express();
app.use(express.json());

const PORT = MOCK_PORTS.EDGE_CASE;

// Track request attempts per endpoint for failUntilAttempt feature
const requestAttempts = new Map<string, number>();

// Track rate limiting
const rateLimitCounters = new Map<string, { count: number; resetTime: number }>();

/**
 * Simulates random API failure based on failure rate
 */
function shouldFail(failureRate: number): boolean {
    return Math.random() < failureRate;
}

/**
 * Simulates progressive success (fail N times, then succeed)
 */
function shouldFailUntilAttempt(key: string, targetAttempt: number): boolean {
    const attempts = (requestAttempts.get(key) || 0) + 1;
    requestAttempts.set(key, attempts);
    return attempts < targetAttempt;
}

/**
 * Check rate limiting
 */
function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const counter = rateLimitCounters.get(key);

    if (!counter || now > counter.resetTime) {
        rateLimitCounters.set(key, { count: 1, resetTime: now + windowMs });
        return false; // Not rate limited
    }

    counter.count++;
    return counter.count > maxRequests; // Rate limited if over max
}

/**
 * Products endpoint with failure simulation
 */
app.get('/api/products', async (req, res) => {
    const failureRate = parseFloat((req.query.failureRate as string) || '0');
    const delay = parseInt((req.query.delay as string) || '0');
    const malformed = req.query.malformed === 'true';
    const rateLimit = req.query.rateLimit === 'true';
    const partialFail = parseFloat((req.query.partialFail as string) || '0');
    const failUntilAttempt = parseInt((req.query.failUntilAttempt as string) || '0');

    // Check rate limiting
    if (rateLimit && checkRateLimit('products', 3, 60000)) {
        return res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Try again later.',
            retryAfter: 60,
        });
    }

    // Simulate progressive success
    if (failUntilAttempt > 0 && shouldFailUntilAttempt('products', failUntilAttempt)) {
        const attempts = requestAttempts.get('products') || 0;
        return res.status(500).json({
            error: 'Internal Server Error',
            message: `Temporary failure (attempt ${attempts}/${failUntilAttempt - 1})`,
        });
    }

    // Simulate random failures
    if (failureRate > 0 && shouldFail(failureRate)) {
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Random simulated failure',
        });
    }

    // Simulate delay/timeout
    if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Generate product data
    const products = [
        {
            sku: 'TEST-001',
            name: 'Test Product 1',
            price: 100,
            description: 'Test product description',
            enabled: true,
        },
        {
            sku: 'TEST-002',
            name: 'Test Product 2',
            price: 200,
            description: 'Another test product',
            enabled: true,
        },
        {
            sku: 'TEST-003',
            name: 'Test Product 3',
            price: 150,
            description: 'Third test product',
            enabled: false,
        },
    ];

    // Simulate partial failures (inject errors into some records)
    if (partialFail > 0) {
        products.forEach((product: any) => {
            if (shouldFail(partialFail)) {
                product._error = 'Simulated record-level error';
                product.price = -1; // Invalid price
            }
        });
    }

    // Return malformed JSON
    if (malformed) {
        res.setHeader('Content-Type', 'application/json');
        return res.send('{"data": [{"sku": "INCOMPLETE'); // Incomplete JSON
    }

    // Normal response
    res.json({
        data: products,
        meta: {
            total: products.length,
            page: 1,
            pageSize: 100,
        },
    });
});

/**
 * Variants endpoint with similar failure simulation
 */
app.get('/api/variants', async (req, res) => {
    const failureRate = parseFloat((req.query.failureRate as string) || '0');
    const delay = parseInt((req.query.delay as string) || '0');

    if (failureRate > 0 && shouldFail(failureRate)) {
        return res.status(500).json({ error: 'Internal Server Error' });
    }

    if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    const variants = [
        {
            sku: 'VAR-001',
            name: 'Variant 1',
            price: 50,
            productSku: 'TEST-001',
            stockLevel: 100,
        },
        {
            sku: 'VAR-002',
            name: 'Variant 2',
            price: 75,
            productSku: 'TEST-001',
            stockLevel: 50,
        },
    ];

    res.json({ data: variants });
});

/**
 * Categories endpoint with circular reference simulation
 */
app.get('/api/categories', (req, res) => {
    const includeCircular = req.query.includeCircular === 'true';

    const categories = [
        { code: 'cat-a', name: 'Category A', parentCode: null },
        { code: 'cat-b', name: 'Category B', parentCode: 'cat-a' },
        { code: 'cat-c', name: 'Category C', parentCode: 'cat-b' },
    ];

    if (includeCircular) {
        // Create circular reference: cat-a → cat-c (closing the loop)
        categories[0].parentCode = 'cat-c';
    }

    res.json({ data: categories });
});

/**
 * Large dataset endpoint (stress test)
 */
app.get('/api/products/bulk', (req, res) => {
    const count = parseInt((req.query.count as string) || '1000');
    const delayPerRecord = parseInt((req.query.delayPerRecord as string) || '0');

    const products: Array<Record<string, unknown>> = [];
    for (let i = 1; i <= count; i++) {
        products.push({
            sku: `BULK-${String(i).padStart(6, '0')}`,
            name: `Bulk Product ${i}`,
            price: 50 + (i % 500),
            description: `Description for bulk product ${i}. `.repeat(5),
        });
    }

    // Simulate slow streaming
    if (delayPerRecord > 0) {
        let index = 0;
        res.setHeader('Content-Type', 'application/json');
        res.write('{"data":[');

        const interval = setInterval(() => {
            if (index >= products.length) {
                res.write(']}');
                res.end();
                clearInterval(interval);
                return;
            }

            if (index > 0) res.write(',');
            res.write(JSON.stringify(products[index]));
            index++;
        }, delayPerRecord);
    } else {
        res.json({ data: products });
    }
});

/**
 * Endpoint that requires authentication
 */
app.get('/api/secured', (req, res) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (apiKey !== 'test-api-key-12345') {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or missing API key',
        });
    }

    res.json({ data: { message: 'Authenticated successfully' } });
});

/**
 * Endpoint with pagination (offset-based)
 */
app.get('/api/products/paginated', (req, res) => {
    const offset = parseInt((req.query.offset as string) || '0');
    const limit = parseInt((req.query.limit as string) || '10');

    // Generate 100 total products
    const totalProducts = 100;
    const products: Array<Record<string, unknown>> = [];

    for (let i = offset; i < Math.min(offset + limit, totalProducts); i++) {
        products.push({
            sku: `PAG-${String(i + 1).padStart(3, '0')}`,
            name: `Paginated Product ${i + 1}`,
            price: 100 + i,
        });
    }

    res.json({
        data: products,
        meta: {
            total: totalProducts,
            offset,
            limit,
            hasMore: offset + limit < totalProducts,
        },
    });
});

/**
 * Endpoint with cursor-based pagination
 */
app.get('/api/products/cursor', (req, res) => {
    const cursor = req.query.cursor ? parseInt(req.query.cursor as string) : 0;
    const limit = parseInt((req.query.limit as string) || '10');

    const totalProducts = 100;
    const products: Array<Record<string, unknown>> = [];

    for (let i = cursor; i < Math.min(cursor + limit, totalProducts); i++) {
        products.push({
            sku: `CUR-${String(i + 1).padStart(3, '0')}`,
            name: `Cursor Product ${i + 1}`,
            price: 100 + i,
        });
    }

    const nextCursor = cursor + limit < totalProducts ? cursor + limit : null;

    res.json({
        data: products,
        cursor: nextCursor,
        hasMore: nextCursor !== null,
    });
});

/**
 * Endpoint that returns different response based on HTTP method
 */
app.post('/api/products/create', (req, res) => {
    const product = req.body;

    // Validate required fields
    if (!product.sku || !product.name) {
        return res.status(400).json({
            error: 'Bad Request',
            message: 'Missing required fields: sku, name',
        });
    }

    // Simulate creation
    res.status(201).json({
        data: {
            ...product,
            id: Math.floor(Math.random() * 100000),
            createdAt: new Date().toISOString(),
        },
    });
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        requestAttempts: Object.fromEntries(requestAttempts),
        rateLimitCounters: Object.fromEntries(
            Array.from(rateLimitCounters.entries()).map(([k, v]) => [
                k,
                { ...v, resetTime: new Date(v.resetTime).toISOString() },
            ])
        ),
    });
});

/**
 * Reset counters endpoint (for testing)
 */
app.post('/reset', (req, res) => {
    requestAttempts.clear();
    rateLimitCounters.clear();
    res.json({ message: 'Counters reset successfully' });
});

/**
 * 404 handler
 */
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Endpoint ${req.method} ${req.path} not found`,
    });
});

/**
 * Error handler
 */
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
    });
});

/**
 * Start server
 */
app.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Mock Edge Case API Server Started');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  URL: http://localhost:${PORT}`);
    console.log('');
    console.log('  Failure Simulation Endpoints:');
    console.log('  ────────────────────────────────────────────────────────');
    console.log('  GET  /api/products?failureRate=0.4     → 40% failure');
    console.log('  GET  /api/products?delay=5000          → 5s delay');
    console.log('  GET  /api/products?malformed=true      → Incomplete JSON');
    console.log('  GET  /api/products?rateLimit=true      → Rate limiting');
    console.log('  GET  /api/products?partialFail=0.3     → 30% record errors');
    console.log('  GET  /api/products?failUntilAttempt=4  → Fail 3x, succeed 4th');
    console.log('');
    console.log('  Other Endpoints:');
    console.log('  ────────────────────────────────────────────────────────');
    console.log('  GET  /api/variants                     → Variant data');
    console.log('  GET  /api/categories?includeCircular   → Circular refs');
    console.log('  GET  /api/products/bulk?count=1000     → Bulk data');
    console.log('  GET  /api/products/paginated           → Offset pagination');
    console.log('  GET  /api/products/cursor              → Cursor pagination');
    console.log('  GET  /api/secured                      → Auth required');
    console.log('  POST /api/products/create              → Create product');
    console.log('  GET  /health                           → Health check');
    console.log('  POST /reset                            → Reset counters');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
});

export default app;
