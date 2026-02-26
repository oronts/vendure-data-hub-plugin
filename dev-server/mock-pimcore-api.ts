/**
 * Mock PIM REST API for Data Hub integration testing.
 *
 * Simulates a typical PIM (Product Information Management) system with:
 *   GET  /api/products           — Paginated product listing (channel, delta, published filters)
 *   GET  /api/products/:id       — Full product detail with variants, attributes, assets
 *   GET  /api/facets             — Facet definitions with values
 *   GET  /api/categories         — Category tree (flat list with parentCode)
 *   GET  /api/promotions         — Promotions / discount rules
 *   GET  /api/stock              — Stock levels per variant per location
 *   GET  /api/channels           — Available sales channels
 *   GET  /api/assets/:id         — Asset metadata
 *   GET  /api/changes            — Change feed for delta sync
 *   POST /api/webhook/notify     — Webhook delivery endpoint
 *
 * Run:  npx ts-node dev-server/mock-pimcore-api.ts
 */
import express from 'express';

const app = express();
app.use(express.json());

// ── Auth ─────────────────────────────────────────────────────────────────────
const API_KEY = 'test-pimcore-api-key';
function authenticate(req: express.Request): boolean {
    const key = req.headers['apikey'] || req.query.apiKey;
    return key === API_KEY;
}
function lang(req: express.Request): string {
    return (req.query.language as string) || (req.headers['x-locale'] as string) || 'de';
}
function t(translations: Record<string, string>, locale: string): string {
    return translations[locale] ?? translations['de'] ?? '';
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Variant {
    itemNumber: string;
    title: Record<string, string>;
    attributes: Record<string, string>;
    price: Record<string, number>;
    stock: Record<string, number>;
    assets: Array<{ id: number; url: string; alt: string }>;
    published: boolean;
    deletedAt?: string;
}

interface Product {
    id: number;
    itemNumber: string;
    type: 'group' | 'product';
    title: Record<string, string>;
    subtitle: Record<string, string>;
    shortDescription: Record<string, string>;
    description: Record<string, string>;
    channels: string[];
    published: boolean;
    categoryCode: string;
    facetCodes: string[];
    assets: Array<{ id: number; url: string; alt: string; type: string }>;
    variants: Variant[];
    modifiedAt: string;
}

interface Facet {
    code: string;
    name: Record<string, string>;
    values: Array<{ code: string; name: Record<string, string> }>;
}

interface Category {
    code: string;
    name: Record<string, string>;
    description: Record<string, string>;
    parentCode: string | null;
    sortOrder: number;
}

interface Promotion {
    code: string;
    name: Record<string, string>;
    enabled: boolean;
    startsAt: string;
    endsAt: string | null;
    type: string;
    discountPercent?: number;
    discountFixed?: number;
    minQuantity?: number;
    channels: string[];
}

interface ChangeEvent {
    timestamp: string;
    entity: string;
    action: 'create' | 'update' | 'delete';
    entityId: number | string;
    details?: string;
}

// ── Facets ───────────────────────────────────────────────────────────────────
const facets: Facet[] = [
    {
        code: 'material',
        name: { de: 'Material', en: 'Material' },
        values: [
            { code: 'nitril', name: { de: 'Nitril', en: 'Nitrile' } },
            { code: 'latex', name: { de: 'Latex', en: 'Latex' } },
            { code: 'ptfe', name: { de: 'PTFE', en: 'PTFE' } },
            { code: 'nylon', name: { de: 'Nylon', en: 'Nylon' } },
            { code: 'glas', name: { de: 'Glas', en: 'Glass' } },
            { code: 'edelstahl', name: { de: 'Edelstahl', en: 'Stainless Steel' } },
            { code: 'baumwolle', name: { de: 'Baumwolle', en: 'Cotton' } },
            { code: 'polypropylen', name: { de: 'Polypropylen', en: 'Polypropylene' } },
            { code: 'silikon', name: { de: 'Silikon', en: 'Silicone' } },
        ],
    },
    {
        code: 'certification',
        name: { de: 'Zertifizierung', en: 'Certification' },
        values: [
            { code: 'ce', name: { de: 'CE', en: 'CE' } },
            { code: 'iso-9001', name: { de: 'ISO 9001', en: 'ISO 9001' } },
            { code: 'glp', name: { de: 'GLP', en: 'GLP' } },
            { code: 'fda', name: { de: 'FDA', en: 'FDA' } },
            { code: 'din-en-420', name: { de: 'DIN EN 420', en: 'DIN EN 420' } },
        ],
    },
    {
        code: 'application',
        name: { de: 'Anwendungsbereich', en: 'Application Area' },
        values: [
            { code: 'labor', name: { de: 'Labor', en: 'Laboratory' } },
            { code: 'industrie', name: { de: 'Industrie', en: 'Industrial' } },
            { code: 'medizin', name: { de: 'Medizin', en: 'Medical' } },
            { code: 'forschung', name: { de: 'Forschung', en: 'Research' } },
        ],
    },
    {
        code: 'hazard-class',
        name: { de: 'Gefahrenklasse', en: 'Hazard Class' },
        values: [
            { code: 'ghs02', name: { de: 'GHS02 – Entzündbar', en: 'GHS02 – Flammable' } },
            { code: 'ghs05', name: { de: 'GHS05 – Ätzend', en: 'GHS05 – Corrosive' } },
            { code: 'ghs07', name: { de: 'GHS07 – Reizend', en: 'GHS07 – Irritant' } },
        ],
    },
];

// ── Categories ───────────────────────────────────────────────────────────────
const categories: Category[] = [
    { code: 'safety-equipment', name: { de: 'Sicherheitsausrüstung', en: 'Safety Equipment' }, description: { de: 'Persönliche Schutzausrüstung', en: 'Personal protective equipment' }, parentCode: null, sortOrder: 1 },
    { code: 'gloves', name: { de: 'Handschuhe', en: 'Gloves' }, description: { de: 'Schutz- und Arbeitshandschuhe', en: 'Protective and work gloves' }, parentCode: 'safety-equipment', sortOrder: 1 },
    { code: 'goggles', name: { de: 'Schutzbrillen', en: 'Safety Goggles' }, description: { de: 'Augenschutz für Labor und Industrie', en: 'Eye protection for lab and industry' }, parentCode: 'safety-equipment', sortOrder: 2 },
    { code: 'lab-coats', name: { de: 'Labormäntel', en: 'Lab Coats' }, description: { de: 'Laborkittel und Schutzmäntel', en: 'Lab coats and protective wear' }, parentCode: 'safety-equipment', sortOrder: 3 },

    { code: 'laboratory-equipment', name: { de: 'Laborgeräte', en: 'Laboratory Equipment' }, description: { de: 'Geräte und Instrumente für das Labor', en: 'Lab instruments and devices' }, parentCode: null, sortOrder: 2 },
    { code: 'pipettes', name: { de: 'Pipetten', en: 'Pipettes' }, description: { de: 'Pipetten und Pipettenspitzen', en: 'Pipettes and pipette tips' }, parentCode: 'laboratory-equipment', sortOrder: 1 },
    { code: 'scales', name: { de: 'Waagen', en: 'Scales' }, description: { de: 'Präzisions- und Analysenwaagen', en: 'Precision and analytical scales' }, parentCode: 'laboratory-equipment', sortOrder: 2 },
    { code: 'microscopes', name: { de: 'Mikroskope', en: 'Microscopes' }, description: { de: 'Licht- und Digitalmikroskope', en: 'Light and digital microscopes' }, parentCode: 'laboratory-equipment', sortOrder: 3 },
    { code: 'centrifuges', name: { de: 'Zentrifugen', en: 'Centrifuges' }, description: { de: 'Labor- und Hochgeschwindigkeitszentrifugen', en: 'Lab and high-speed centrifuges' }, parentCode: 'laboratory-equipment', sortOrder: 4 },

    { code: 'filters-membranes', name: { de: 'Filter & Membranen', en: 'Filters & Membranes' }, description: { de: 'Membranfilter und Spritzenfilter', en: 'Membrane and syringe filters' }, parentCode: null, sortOrder: 3 },
    { code: 'containers', name: { de: 'Behälter', en: 'Containers' }, description: { de: 'Sicherheits- und Lagerbehälter', en: 'Safety and storage containers' }, parentCode: null, sortOrder: 4 },
    { code: 'chemicals', name: { de: 'Chemikalien', en: 'Chemicals' }, description: { de: 'Lösungsmittel und Reagenzien', en: 'Solvents and reagents' }, parentCode: null, sortOrder: 5 },
    { code: 'cleaning', name: { de: 'Reinigung', en: 'Cleaning' }, description: { de: 'Reinigungsmittel und Reinraumzubehör', en: 'Cleaning supplies and cleanroom accessories' }, parentCode: null, sortOrder: 6 },
];

// ── Promotions ───────────────────────────────────────────────────────────────
const promotions: Promotion[] = [
    {
        code: 'SUMMER2024', name: { de: 'Sommer-Aktion 2024', en: 'Summer Sale 2024' },
        enabled: true, startsAt: '2024-06-01T00:00:00Z', endsAt: '2024-08-31T23:59:59Z',
        type: 'percentage', discountPercent: 10, channels: ['web', 'b2b'],
    },
    {
        code: 'LAB-BUNDLE', name: { de: 'Labor-Bundle Rabatt', en: 'Lab Bundle Discount' },
        enabled: true, startsAt: '2024-01-01T00:00:00Z', endsAt: null,
        type: 'percentage', discountPercent: 15, minQuantity: 3, channels: ['web', 'b2b'],
    },
    {
        code: 'B2B-WELCOME', name: { de: 'B2B Willkommensrabatt', en: 'B2B Welcome Discount' },
        enabled: true, startsAt: '2024-01-01T00:00:00Z', endsAt: null,
        type: 'percentage', discountPercent: 5, channels: ['b2b'],
    },
    {
        code: 'FILTER-SALE', name: { de: 'Filter-Aktion', en: 'Filter Sale' },
        enabled: false, startsAt: '2025-01-01T00:00:00Z', endsAt: '2025-03-31T23:59:59Z',
        type: 'fixed', discountFixed: 500, channels: ['web'],
    },
    {
        code: 'NEWYEAR2026', name: { de: 'Neujahrs-Rabatt 2026', en: 'New Year Discount 2026' },
        enabled: true, startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-03-31T23:59:59Z',
        type: 'percentage', discountPercent: 20, channels: ['web', 'b2b'],
    },
];

// ── Channels ─────────────────────────────────────────────────────────────────
const channels = [
    { code: 'web', name: { de: 'Webshop', en: 'Webshop' }, defaultLanguage: 'de', languages: ['de', 'en'], defaultCurrency: 'EUR', currencies: ['EUR', 'USD', 'CHF'] },
    { code: 'b2b', name: { de: 'B2B Portal', en: 'B2B Portal' }, defaultLanguage: 'de', languages: ['de', 'en'], defaultCurrency: 'EUR', currencies: ['EUR', 'USD'] },
];

// ── Assets ───────────────────────────────────────────────────────────────────
const ASSET_BASE = 'https://picsum.photos/seed';
function assetUrl(seed: string, w = 800, h = 600): string {
    return `${ASSET_BASE}/${seed}/${w}/${h}`;
}
let assetIdSeq = 100;
function mkAsset(seed: string, alt: string, type = 'image') {
    return { id: assetIdSeq++, url: assetUrl(seed), alt, type };
}

// ── Products ─────────────────────────────────────────────────────────────────
const now = new Date().toISOString();
const products: Product[] = [
    // 1: Group — Safety gloves (4 size variants, 1 discontinued)
    {
        id: 1001, itemNumber: 'LS-GLV-001', type: 'group',
        title: { de: 'Schutzhandschuh ProGrip', en: 'ProGrip Safety Glove' },
        subtitle: { de: 'Chemikalienbeständig', en: 'Chemical resistant' },
        shortDescription: { de: 'Nitril-Schutzhandschuh für Labor und Industrie', en: 'Nitrile safety glove for lab and industry' },
        description: { de: '<p>Der ProGrip Schutzhandschuh bietet maximalen Schutz bei der Arbeit mit aggressiven Chemikalien. EN 374 zertifiziert.</p>', en: '<p>The ProGrip safety glove provides maximum protection when working with aggressive chemicals. EN 374 certified.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'gloves', facetCodes: ['material:nitril', 'certification:ce', 'certification:din-en-420', 'application:labor', 'application:industrie'],
        assets: [mkAsset('glove-progrip', 'ProGrip Handschuh'), mkAsset('glove-progrip-detail', 'ProGrip Detail')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-GLV-001-S', title: { de: 'ProGrip S', en: 'ProGrip S' }, attributes: { size: 'S', color: 'Blau' }, price: { EUR: 29.90, USD: 32.50 }, stock: { Hauptlager: 0, Aussenlager: 0 }, assets: [], published: true, deletedAt: '2026-02-26T00:00:00Z' },
            { itemNumber: 'LS-GLV-001-M', title: { de: 'ProGrip M', en: 'ProGrip M' }, attributes: { size: 'M', color: 'Blau' }, price: { EUR: 29.90, USD: 32.50 }, stock: { Hauptlager: 800, Aussenlager: 200 }, assets: [], published: true },
            { itemNumber: 'LS-GLV-001-L', title: { de: 'ProGrip L', en: 'ProGrip L' }, attributes: { size: 'L', color: 'Blau' }, price: { EUR: 29.90, USD: 32.50 }, stock: { Hauptlager: 600, Aussenlager: 150 }, assets: [], published: true },
            { itemNumber: 'LS-GLV-001-XL', title: { de: 'ProGrip XL', en: 'ProGrip XL' }, attributes: { size: 'XL', color: 'Blau' }, price: { EUR: 31.90, USD: 34.50 }, stock: { Hauptlager: 300, Aussenlager: 80 }, assets: [], published: true },
        ],
    },
    // 2: Single — Safety goggles
    {
        id: 1002, itemNumber: 'LS-GOG-001', type: 'product',
        title: { de: 'Schutzbrille SafeView Pro', en: 'SafeView Pro Safety Goggles' },
        subtitle: { de: 'Antibeschlag-Beschichtung mit UV-Schutz', en: 'Anti-fog coating with UV protection' },
        shortDescription: { de: 'Vollsichtbrille mit Panoramascheibe', en: 'Full-vision goggles with panoramic lens' },
        description: { de: '<p>Die SafeView Schutzbrille bietet optimalen Augenschutz mit klarer Sicht. Antibeschlag-Beschichtung und kratzfeste Scheibe.</p>', en: '<p>SafeView safety goggles provide optimal eye protection with clear vision. Anti-fog coating and scratch-resistant lens.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'goggles', facetCodes: ['material:polypropylen', 'certification:ce', 'application:labor', 'application:industrie'],
        assets: [mkAsset('goggles-safeview', 'SafeView Brille')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-GOG-001', title: { de: 'Schutzbrille SafeView Pro', en: 'SafeView Pro Safety Goggles' }, attributes: {}, price: { EUR: 22.90, USD: 24.90 }, stock: { Hauptlager: 1200, Aussenlager: 300 }, assets: [], published: true },
        ],
    },
    // 3: Group — Premium pipettes (3 volume variants)
    {
        id: 1003, itemNumber: 'LS-PIP-001', type: 'group',
        title: { de: 'Laborpipette Premium', en: 'Premium Lab Pipette' },
        subtitle: { de: 'Einstellbare Mikroliterpipette', en: 'Adjustable microliter pipette' },
        shortDescription: { de: 'Ergonomische Einkanalpipette mit digitaler Volumenanzeige', en: 'Ergonomic single-channel pipette with digital volume display' },
        description: { de: '<p>Die Premium Laborpipette vereint Präzision und Ergonomie. Autoklavierbar, mit digitalem Display und Soft-Touch-Bedienung.</p>', en: '<p>The Premium lab pipette combines precision and ergonomics. Autoclavable, with digital display and soft-touch operation.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'pipettes', facetCodes: ['certification:iso-9001', 'certification:glp', 'application:labor', 'application:forschung'],
        assets: [mkAsset('pipette-premium', 'Premium Pipette')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-PIP-001-10', title: { de: 'Pipette 0.5-10µl', en: 'Pipette 0.5-10µl' }, attributes: { volume: '0.5-10µl', color: 'Grau' }, price: { EUR: 189.00, USD: 209.00 }, stock: { Hauptlager: 45, Aussenlager: 10 }, assets: [], published: true },
            { itemNumber: 'LS-PIP-001-100', title: { de: 'Pipette 10-100µl', en: 'Pipette 10-100µl' }, attributes: { volume: '10-100µl', color: 'Gelb' }, price: { EUR: 199.00, USD: 219.00 }, stock: { Hauptlager: 60, Aussenlager: 15 }, assets: [], published: true },
            { itemNumber: 'LS-PIP-001-1000', title: { de: 'Pipette 100-1000µl', en: 'Pipette 100-1000µl' }, attributes: { volume: '100-1000µl', color: 'Blau' }, price: { EUR: 209.00, USD: 229.00 }, stock: { Hauptlager: 35, Aussenlager: 8 }, assets: [], published: true },
        ],
    },
    // 4: Group — Pipette tips (2 type variants)
    {
        id: 1004, itemNumber: 'LS-TIP-001', type: 'group',
        title: { de: 'Pipettenspitzen Universal', en: 'Universal Pipette Tips' },
        subtitle: { de: 'Passend für alle gängigen Pipetten', en: 'Compatible with all standard pipettes' },
        shortDescription: { de: 'Hochwertige Pipettenspitzen in Rackverpackung', en: 'High-quality pipette tips in rack packaging' },
        description: { de: '<p>Universal-Pipettenspitzen aus reinem Polypropylen. RNase/DNase-frei, autoklavierbar.</p>', en: '<p>Universal pipette tips made from pure polypropylene. RNase/DNase-free, autoclavable.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'pipettes', facetCodes: ['material:polypropylen', 'certification:iso-9001', 'application:labor'],
        assets: [mkAsset('tips-universal', 'Universal Tips')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-TIP-001-STD', title: { de: 'Spitzen Standard 200µl', en: 'Tips Standard 200µl' }, attributes: { type: 'Standard', volume: '200µl' }, price: { EUR: 12.90, USD: 14.50 }, stock: { Hauptlager: 8000, Aussenlager: 3000 }, assets: [], published: true },
            { itemNumber: 'LS-TIP-001-FIL', title: { de: 'Spitzen Filter 200µl', en: 'Tips Filter 200µl' }, attributes: { type: 'Filter', volume: '200µl' }, price: { EUR: 18.90, USD: 20.90 }, stock: { Hauptlager: 5000, Aussenlager: 2000 }, assets: [], published: true },
        ],
    },
    // 5: Single — 5L safety container
    {
        id: 1005, itemNumber: 'LS-CON-001', type: 'product',
        title: { de: 'Sicherheitsbehälter 5L', en: '5L Safety Container' },
        subtitle: { de: 'UN-zugelassen', en: 'UN-approved' },
        shortDescription: { de: 'Sicherheitsbehälter aus Edelstahl für brennbare Flüssigkeiten', en: 'Stainless steel safety container for flammable liquids' },
        description: { de: '<p>5-Liter Sicherheitsbehälter aus Edelstahl mit Flammensperre und Federverschluss.</p>', en: '<p>5-liter stainless steel safety container with flame arrester and spring closure.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'containers', facetCodes: ['material:edelstahl', 'certification:ce', 'application:labor', 'application:industrie'],
        assets: [mkAsset('container-5l', 'Sicherheitsbehälter 5L')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-CON-001', title: { de: 'Sicherheitsbehälter 5L', en: '5L Safety Container' }, attributes: {}, price: { EUR: 145.50, USD: 159.00 }, stock: { Hauptlager: 80, Aussenlager: 20 }, assets: [], published: true },
        ],
    },
    // 6: Single — 10L safety container
    {
        id: 1006, itemNumber: 'LS-CON-002', type: 'product',
        title: { de: 'Sicherheitsbehälter 10L', en: '10L Safety Container' },
        subtitle: { de: 'UN-zugelassen', en: 'UN-approved' },
        shortDescription: { de: 'Großer Sicherheitsbehälter für Lagerhaltung', en: 'Large safety container for storage' },
        description: { de: '<p>10-Liter Sicherheitsbehälter aus Edelstahl. Ideal für die Lagerhaltung brennbarer Lösungsmittel.</p>', en: '<p>10-liter stainless steel safety container. Ideal for storing flammable solvents.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'containers', facetCodes: ['material:edelstahl', 'certification:ce', 'application:industrie'],
        assets: [mkAsset('container-10l', '10L Container')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-CON-002', title: { de: 'Sicherheitsbehälter 10L', en: '10L Safety Container' }, attributes: {}, price: { EUR: 198.00, USD: 215.00 }, stock: { Hauptlager: 50, Aussenlager: 12 }, assets: [], published: true },
        ],
    },
    // 7: Group — PTFE membrane filters (3 pore sizes)
    {
        id: 1007, itemNumber: 'LS-FIL-001', type: 'group',
        title: { de: 'Membranfilter PTFE', en: 'PTFE Membrane Filter' },
        subtitle: { de: 'Für aggressive Chemikalien', en: 'For aggressive chemicals' },
        shortDescription: { de: 'PTFE-Membranfilter für chemische Filtration', en: 'PTFE membrane filter for chemical filtration' },
        description: { de: '<p>Hydrophobe PTFE-Membranfilter für die Filtration aggressiver Chemikalien und Lösungsmittel. Ø 47mm.</p>', en: '<p>Hydrophobic PTFE membrane filters for filtration of aggressive chemicals and solvents. Ø 47mm.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'filters-membranes', facetCodes: ['material:ptfe', 'certification:iso-9001', 'application:labor', 'application:forschung'],
        assets: [mkAsset('filter-ptfe', 'PTFE Filter')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-FIL-001-02', title: { de: 'PTFE Filter 0.2µm', en: 'PTFE Filter 0.2µm' }, attributes: { poreSize: '0.2µm', diameter: '47mm' }, price: { EUR: 78.00, USD: 86.00 }, stock: { Hauptlager: 200, Aussenlager: 50 }, assets: [], published: true },
            { itemNumber: 'LS-FIL-001-05', title: { de: 'PTFE Filter 0.5µm', en: 'PTFE Filter 0.5µm' }, attributes: { poreSize: '0.5µm', diameter: '47mm' }, price: { EUR: 72.00, USD: 79.00 }, stock: { Hauptlager: 180, Aussenlager: 40 }, assets: [], published: true },
            { itemNumber: 'LS-FIL-001-10', title: { de: 'PTFE Filter 1.0µm', en: 'PTFE Filter 1.0µm' }, attributes: { poreSize: '1.0µm', diameter: '47mm' }, price: { EUR: 68.00, USD: 75.00 }, stock: { Hauptlager: 250, Aussenlager: 60 }, assets: [], published: true },
        ],
    },
    // 8: Group — Nylon syringe filters (2 pore sizes, web-only)
    {
        id: 1008, itemNumber: 'LS-FIL-002', type: 'group',
        title: { de: 'Spritzenfilter Nylon', en: 'Nylon Syringe Filter' },
        subtitle: { de: 'Für wässrige Lösungen', en: 'For aqueous solutions' },
        shortDescription: { de: 'Einweg-Spritzenfilter mit Nylon-Membran', en: 'Disposable syringe filter with nylon membrane' },
        description: { de: '<p>Nylon-Spritzenfilter für die Filtration wässriger und organischer Lösungen. Ø 25mm, Luer-Lock-Anschluss.</p>', en: '<p>Nylon syringe filters for filtration of aqueous and organic solutions. Ø 25mm, Luer-Lock connection.</p>' },
        channels: ['web'], published: true,
        categoryCode: 'filters-membranes', facetCodes: ['material:nylon', 'application:labor'],
        assets: [mkAsset('filter-nylon', 'Nylon Spritzenfilter')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-FIL-002-022', title: { de: 'Spritzenfilter 0.22µm', en: 'Syringe Filter 0.22µm' }, attributes: { poreSize: '0.22µm', diameter: '25mm' }, price: { EUR: 45.00, USD: 49.50 }, stock: { Hauptlager: 1000, Aussenlager: 300 }, assets: [], published: true },
            { itemNumber: 'LS-FIL-002-045', title: { de: 'Spritzenfilter 0.45µm', en: 'Syringe Filter 0.45µm' }, attributes: { poreSize: '0.45µm', diameter: '25mm' }, price: { EUR: 42.00, USD: 46.00 }, stock: { Hauptlager: 900, Aussenlager: 250 }, assets: [], published: true },
        ],
    },
    // 9: Single — Precision balance (low stock)
    {
        id: 1009, itemNumber: 'LS-BAL-001', type: 'product',
        title: { de: 'Präzisionswaage LabScale 200', en: 'LabScale 200 Precision Balance' },
        subtitle: { de: '0.001g Auflösung', en: '0.001g resolution' },
        shortDescription: { de: 'Analytische Präzisionswaage mit internem Justiergewicht', en: 'Analytical precision balance with internal calibration weight' },
        description: { de: '<p>Die LabScale 200 bietet höchste Präzision mit 0.001g Auflösung bei 220g Kapazität. Internes Justiergewicht, GLP-konform.</p>', en: '<p>The LabScale 200 offers highest precision with 0.001g resolution at 220g capacity. Internal calibration weight, GLP compliant.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'scales', facetCodes: ['certification:glp', 'certification:iso-9001', 'application:labor', 'application:forschung'],
        assets: [mkAsset('scale-200', 'LabScale 200')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-BAL-001', title: { de: 'LabScale 200', en: 'LabScale 200' }, attributes: {}, price: { EUR: 2450.00, USD: 2690.00 }, stock: { Hauptlager: 2, Aussenlager: 0 }, assets: [], published: true },
        ],
    },
    // 10: Single — Analytical balance
    {
        id: 1010, itemNumber: 'LS-BAL-002', type: 'product',
        title: { de: 'Analysenwaage LabScale 500', en: 'LabScale 500 Analytical Balance' },
        subtitle: { de: '0.0001g Auflösung', en: '0.0001g resolution' },
        shortDescription: { de: 'Hochpräzise Analysenwaage mit Windschutz', en: 'High-precision analytical balance with draft shield' },
        description: { de: '<p>Die LabScale 500 mit 0.0001g Auflösung und 520g Kapazität. Motorisierter Windschutz, USB-Datenübertragung.</p>', en: '<p>The LabScale 500 with 0.0001g resolution and 520g capacity. Motorized draft shield, USB data transfer.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'scales', facetCodes: ['certification:glp', 'certification:fda', 'application:labor', 'application:forschung', 'application:medizin'],
        assets: [mkAsset('scale-500', 'LabScale 500')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-BAL-002', title: { de: 'LabScale 500', en: 'LabScale 500' }, attributes: {}, price: { EUR: 4890.00, USD: 5350.00 }, stock: { Hauptlager: 8, Aussenlager: 2 }, assets: [], published: true },
        ],
    },
    // 11: Single — Ethanol (tests publish lifecycle)
    {
        id: 1011, itemNumber: 'LS-CHM-001', type: 'product',
        title: { de: 'Ethanol technisch 99%', en: 'Ethanol Technical Grade 99%' },
        subtitle: { de: 'Technische Qualität', en: 'Technical grade' },
        shortDescription: { de: 'Ethanol für technische Anwendungen', en: 'Ethanol for technical applications' },
        description: { de: '<p>Ethanol 99% technische Qualität. 2.5L Gebinde. Nur für technische Zwecke.</p>', en: '<p>Ethanol 99% technical grade. 2.5L bottle. For technical use only.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'chemicals', facetCodes: ['hazard-class:ghs02', 'hazard-class:ghs07', 'application:labor', 'application:industrie'],
        assets: [mkAsset('ethanol-99', 'Ethanol 99%')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-CHM-001', title: { de: 'Ethanol tech. 99% 2.5L', en: 'Ethanol tech. 99% 2.5L' }, attributes: {}, price: { EUR: 32.50, USD: 35.90 }, stock: { Hauptlager: 400, Aussenlager: 100 }, assets: [], published: true },
        ],
    },
    // 12: Single — Isopropanol
    {
        id: 1012, itemNumber: 'LS-CHM-002', type: 'product',
        title: { de: 'Isopropanol p.a.', en: 'Isopropanol p.a.' },
        subtitle: { de: 'Zur Analyse', en: 'For analysis' },
        shortDescription: { de: 'Isopropanol zur Analyse, ≥99.8%', en: 'Isopropanol for analysis, ≥99.8%' },
        description: { de: '<p>Isopropanol p.a. (zur Analyse) ≥99.8%. 1L Braunglasflasche.</p>', en: '<p>Isopropanol p.a. (for analysis) ≥99.8%. 1L amber glass bottle.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'chemicals', facetCodes: ['hazard-class:ghs02', 'hazard-class:ghs07', 'application:labor', 'application:forschung'],
        assets: [mkAsset('isopropanol', 'Isopropanol p.a.')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-CHM-002', title: { de: 'Isopropanol p.a. 1L', en: 'Isopropanol p.a. 1L' }, attributes: {}, price: { EUR: 28.90, USD: 31.50 }, stock: { Hauptlager: 600, Aussenlager: 150 }, assets: [], published: true },
        ],
    },
    // 13: Single — Microscope (unpublished — tests filtering)
    {
        id: 1013, itemNumber: 'LS-MIC-001', type: 'product',
        title: { de: 'Mikroskop BioView 400', en: 'BioView 400 Microscope' },
        subtitle: { de: 'Binokulares Labormikroskop', en: 'Binocular lab microscope' },
        shortDescription: { de: 'Binokulares Mikroskop mit LED-Beleuchtung', en: 'Binocular microscope with LED illumination' },
        description: { de: '<p>Das BioView 400 ist ein professionelles binokulares Labormikroskop mit LED-Beleuchtung und 4 Objektiven (4x/10x/40x/100x).</p>', en: '<p>The BioView 400 is a professional binocular lab microscope with LED illumination and 4 objectives (4x/10x/40x/100x).</p>' },
        channels: ['web'], published: false,
        categoryCode: 'microscopes', facetCodes: ['certification:ce', 'application:labor', 'application:forschung', 'application:medizin'],
        assets: [mkAsset('microscope-bioview', 'BioView 400')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-MIC-001', title: { de: 'BioView 400', en: 'BioView 400' }, attributes: {}, price: { EUR: 1890.00, USD: 2090.00 }, stock: { Hauptlager: 5, Aussenlager: 0 }, assets: [], published: false },
        ],
    },
    // 14: Group — Lab coat (3 active sizes + 1 new + 1 discontinued)
    {
        id: 1014, itemNumber: 'LS-COA-001', type: 'group',
        title: { de: 'Labormantel Classic', en: 'Classic Lab Coat' },
        subtitle: { de: '100% Baumwolle', en: '100% Cotton' },
        shortDescription: { de: 'Klassischer Labormantel mit Druckknöpfen', en: 'Classic lab coat with snap buttons' },
        description: { de: '<p>Labormantel aus 100% Baumwolle mit Druckknopfleiste, Brusttasche und zwei Seitentaschen. Waschbar bei 60°C.</p>', en: '<p>Lab coat made of 100% cotton with snap button front, chest pocket and two side pockets. Washable at 60°C.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'lab-coats', facetCodes: ['material:baumwolle', 'certification:ce', 'application:labor'],
        assets: [mkAsset('labcoat-classic', 'Labormantel Classic')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-COA-001-S', title: { de: 'Labormantel S', en: 'Lab Coat S' }, attributes: { size: 'S' }, price: { EUR: 39.90, USD: 43.90 }, stock: { Hauptlager: 200, Aussenlager: 50 }, assets: [], published: true },
            { itemNumber: 'LS-COA-001-M', title: { de: 'Labormantel M', en: 'Lab Coat M' }, attributes: { size: 'M' }, price: { EUR: 39.90, USD: 43.90 }, stock: { Hauptlager: 350, Aussenlager: 80 }, assets: [], published: true },
            { itemNumber: 'LS-COA-001-L', title: { de: 'Labormantel L', en: 'Lab Coat L' }, attributes: { size: 'L' }, price: { EUR: 39.90, USD: 43.90 }, stock: { Hauptlager: 280, Aussenlager: 70 }, assets: [], published: true },
            { itemNumber: 'LS-COA-001-XXL', title: { de: 'Labormantel XXL', en: 'Lab Coat XXL' }, attributes: { size: 'XXL' }, price: { EUR: 44.90, USD: 48.90 }, stock: { Hauptlager: 150, Aussenlager: 40 }, assets: [], published: true },
            { itemNumber: 'LS-COA-001-XL', title: { de: 'Labormantel XL', en: 'Lab Coat XL' }, attributes: { size: 'XL' }, price: { EUR: 42.90, USD: 46.90 }, stock: { Hauptlager: 0, Aussenlager: 0 }, assets: [], published: true, deletedAt: '2024-11-01T00:00:00Z' },
        ],
    },
    // 15: Single — Centrifuge (B2B only)
    {
        id: 1015, itemNumber: 'LS-CEN-001', type: 'product',
        title: { de: 'Zentrifuge SpinMax 8000', en: 'SpinMax 8000 Centrifuge' },
        subtitle: { de: 'Bis 15.000 RPM', en: 'Up to 15,000 RPM' },
        shortDescription: { de: 'Hochgeschwindigkeitszentrifuge für Routineanwendungen', en: 'High-speed centrifuge for routine applications' },
        description: { de: '<p>Die SpinMax 8000 erreicht bis zu 15.000 RPM mit 24 Probenpositionen. Kühlfunktion, leiser Betrieb.</p>', en: '<p>The SpinMax 8000 reaches up to 15,000 RPM with 24 sample positions. Cooling function, quiet operation.</p>' },
        channels: ['b2b'], published: true,
        categoryCode: 'centrifuges', facetCodes: ['certification:ce', 'certification:iso-9001', 'application:labor', 'application:forschung'],
        assets: [mkAsset('centrifuge-spinmax', 'SpinMax 8000')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-CEN-001', title: { de: 'SpinMax 8000', en: 'SpinMax 8000' }, attributes: {}, price: { EUR: 6750.00, USD: 7400.00 }, stock: { Hauptlager: 4, Aussenlager: 1 }, assets: [], published: true },
        ],
    },
    // 16: Group — Lab towels (2 size/pack variants)
    {
        id: 1016, itemNumber: 'LS-TOW-001', type: 'group',
        title: { de: 'Laborhandtuch Premium', en: 'Premium Lab Towel' },
        subtitle: { de: 'Fusselfreie Reinigungstücher', en: 'Lint-free cleaning towels' },
        shortDescription: { de: 'Fusselfreie Reinigungstücher für Labor und Reinraum', en: 'Lint-free cleaning towels for lab and cleanroom' },
        description: { de: '<p>Premium-Laborhandtücher aus Polyester/Cellulose-Mischung. Fusselarm, hohe Saugfähigkeit, ISO 5 Reinraum-kompatibel.</p>', en: '<p>Premium lab towels made from polyester/cellulose blend. Low lint, high absorbency, ISO 5 cleanroom compatible.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'cleaning', facetCodes: ['certification:iso-9001', 'application:labor', 'application:forschung'],
        assets: [mkAsset('labtowel-premium', 'Premium Laborhandtuch')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-TOW-001-S', title: { de: 'Laborhandtuch 23x23cm (100er)', en: 'Lab Towel 23x23cm (100pk)' }, attributes: { size: '23x23cm', packSize: '100' }, price: { EUR: 14.90, USD: 16.50 }, stock: { Hauptlager: 2000, Aussenlager: 500 }, assets: [], published: true },
            { itemNumber: 'LS-TOW-001-L', title: { de: 'Laborhandtuch 30x30cm (50er)', en: 'Lab Towel 30x30cm (50pk)' }, attributes: { size: '30x30cm', packSize: '50' }, price: { EUR: 18.90, USD: 20.90 }, stock: { Hauptlager: 1500, Aussenlager: 400 }, assets: [], published: true },
        ],
    },
];

// ── Change Feed ──────────────────────────────────────────────────────────────
const changeLog: ChangeEvent[] = [
    { timestamp: new Date(Date.now() - 3600000).toISOString(), entity: 'product', action: 'update', entityId: 1001, details: 'Price updated for ProGrip XL' },
    { timestamp: new Date(Date.now() - 7200000).toISOString(), entity: 'product', action: 'update', entityId: 1014, details: 'Variant LS-COA-001-XL discontinued' },
    { timestamp: new Date(Date.now() - 86400000).toISOString(), entity: 'product', action: 'create', entityId: 1015, details: 'New product SpinMax 8000' },
    { timestamp: new Date(Date.now() - 172800000).toISOString(), entity: 'facet', action: 'update', entityId: 'hazard-class', details: 'New hazard class GHS07 added' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function filterByChannel(items: Product[], channel?: string): Product[] {
    if (!channel) return items;
    const allowed = channel.split(',').map(c => c.trim());
    return items.filter(p => p.channels.some(c => allowed.includes(c)));
}

function buildListingItem(p: Product, locale: string) {
    return {
        id: p.id,
        itemNumber: p.itemNumber,
        type: p.type,
        title: t(p.title, locale),
        published: p.published,
        channels: p.channels,
        categoryCode: p.categoryCode,
        variantCount: p.variants.filter(v => !v.deletedAt).length,
        modifiedAt: p.modifiedAt,
    };
}

function buildDetailResponse(p: Product, locale: string) {
    const activeVariants = p.variants.filter(v => !v.deletedAt);
    return {
        product: {
            id: p.id,
            itemNumber: p.itemNumber,
            type: p.type,
            title: t(p.title, locale),
            subtitle: t(p.subtitle, locale),
            shortDescription: t(p.shortDescription, locale),
            description: t(p.description, locale),
            channels: p.channels,
            published: p.published,
            categoryCode: p.categoryCode,
            facetCodes: p.facetCodes,
        },
        assets: p.assets.map(a => ({ id: a.id, url: a.url, alt: a.alt, type: a.type })),
        variants: activeVariants.map(v => ({
            itemNumber: v.itemNumber,
            title: t(v.title, locale),
            attributes: v.attributes,
            price: v.price,
            stock: v.stock,
            assets: v.assets,
            published: v.published,
        })),
        deletedVariants: p.variants.filter(v => v.deletedAt).map(v => ({
            itemNumber: v.itemNumber,
            deletedAt: v.deletedAt,
        })),
    };
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/products', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    const channel = req.query.channel as string | undefined;
    const includeUnpublished = req.query.includeUnpublished === 'true';
    const modifiedAfter = req.query.modifiedAfter as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 100));

    let filtered = filterByChannel(products, channel);
    if (!includeUnpublished) filtered = filtered.filter(p => p.published);
    if (modifiedAfter) {
        const since = new Date(modifiedAfter).getTime();
        filtered = filtered.filter(p => new Date(p.modifiedAt).getTime() > since);
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    console.log(`[PIM] GET /api/products -> ${items.length}/${total} (page ${page}, channel=${channel ?? 'all'}, lang=${locale})`);
    res.json({
        products: items.map(p => buildListingItem(p, locale)),
        pagination: { page, limit, total, totalPages },
    });
});

app.get('/api/products/:id', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    const p = products.find(p => String(p.id) === req.params.id || p.itemNumber === req.params.id);
    if (!p) return res.status(404).json({ error: 'Product not found' });
    console.log(`[PIM] GET /api/products/${req.params.id} -> ${p.itemNumber}`);
    res.json(buildDetailResponse(p, locale));
});

app.get('/api/facets', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    console.log(`[PIM] GET /api/facets -> ${facets.length} facets`);
    res.json({
        facets: facets.map(f => ({
            code: f.code,
            name: t(f.name, locale),
            values: f.values.map(v => ({ code: v.code, name: t(v.name, locale) })),
        })),
    });
});

app.get('/api/categories', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    console.log(`[PIM] GET /api/categories -> ${categories.length} categories`);
    res.json({
        categories: categories.map(c => ({
            code: c.code,
            name: t(c.name, locale),
            description: t(c.description, locale),
            parentCode: c.parentCode,
            sortOrder: c.sortOrder,
        })),
    });
});

app.get('/api/promotions', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    console.log(`[PIM] GET /api/promotions -> ${promotions.length} promotions`);
    res.json({
        promotions: promotions.map(p => ({
            code: p.code,
            name: t(p.name, locale),
            enabled: p.enabled,
            startsAt: p.startsAt,
            endsAt: p.endsAt,
            type: p.type,
            discountPercent: p.discountPercent,
            discountFixed: p.discountFixed,
            minQuantity: p.minQuantity,
            channels: p.channels,
        })),
    });
});

app.get('/api/stock', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const stockItems: Array<{ sku: string; location: string; qty: number }> = [];
    for (const p of products) {
        for (const v of p.variants) {
            if (v.deletedAt) continue;
            for (const [location, qty] of Object.entries(v.stock)) {
                stockItems.push({ sku: v.itemNumber, location, qty });
            }
        }
    }
    console.log(`[PIM] GET /api/stock -> ${stockItems.length} entries`);
    res.json({ stock: stockItems });
});

app.get('/api/channels', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    console.log(`[PIM] GET /api/channels -> ${channels.length} channels`);
    res.json({
        channels: channels.map(c => ({
            code: c.code,
            name: t(c.name, locale),
            defaultLanguage: c.defaultLanguage,
            languages: c.languages,
            defaultCurrency: c.defaultCurrency,
            currencies: c.currencies,
        })),
    });
});

app.get('/api/assets/:id', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const id = parseInt(req.params.id);
    for (const p of products) {
        for (const a of p.assets) {
            if (a.id === id) {
                console.log(`[PIM] GET /api/assets/${id} -> ${a.alt}`);
                return res.json({ id: a.id, url: a.url, alt: a.alt, type: a.type, product: p.itemNumber });
            }
        }
    }
    res.status(404).json({ error: 'Asset not found' });
});

app.get('/api/changes', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const since = req.query.since as string | undefined;
    let events = changeLog;
    if (since) {
        const sinceTs = new Date(since).getTime();
        events = events.filter(e => new Date(e.timestamp).getTime() > sinceTs);
    }
    console.log(`[PIM] GET /api/changes -> ${events.length} events (since=${since ?? 'all'})`);
    res.json({ changes: events });
});

app.post('/api/webhook/notify', (req, res) => {
    console.log(`[PIM] POST /api/webhook/notify -> ${JSON.stringify(req.body)}`);
    res.json({ received: true, timestamp: new Date().toISOString() });
});

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', products: products.length, facets: facets.length, categories: categories.length });
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PIMCORE_PORT || '3333');
app.listen(PORT, () => {
    const variantCount = products.reduce((sum, p) => sum + p.variants.filter(v => !v.deletedAt).length, 0);
    const deletedCount = products.reduce((sum, p) => sum + p.variants.filter(v => v.deletedAt).length, 0);
    console.log(`\nMock PIM API running on http://localhost:${PORT}`);
    console.log(`  Products: ${products.length} (${products.filter(p => p.published).length} published)`);
    console.log(`  Variants: ${variantCount} active, ${deletedCount} deleted`);
    console.log(`  Facets: ${facets.length}, Categories: ${categories.length}, Promotions: ${promotions.length}`);
    console.log(`  Channels: ${channels.map(c => c.code).join(', ')}`);
    console.log(`  API Key: ${API_KEY}\n`);
});
