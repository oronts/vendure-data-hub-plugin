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
 *   GET  /api/customers          — Customer listing with address/group data
 *   GET  /api/customers/:id      — Customer detail
 *   GET  /api/shipping-methods   — Shipping method definitions
 *   GET  /api/payment-methods    — Payment method definitions
 *   GET  /api/tax-rates          — Tax rate definitions
 *   GET  /api/customer-groups    — Customer group membership (derived from customers)
 *   GET  /api/orders             — Order history with lines, addresses
 *   GET  /api/deletions          — Entities marked for deletion
 *   GET  /api/assets/:id         — Asset metadata
 *   GET  /api/changes            — Change feed for delta sync
 *   POST /api/webhook/notify     — Webhook delivery endpoint
 *   GET  /api/health             — Health check with entity counts
 *
 * All GET endpoints support ?includeTranslations=true to return full { en: {...}, de: {...} }
 * translation objects alongside the locale-resolved single-string fields.
 *
 * Run:  npx ts-node dev-server/mock/mock-pimcore-api.ts
 */
import express from 'express';
import { MOCK_PORTS } from '../ports';

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
function wantTranslations(req: express.Request): boolean {
    return req.query.includeTranslations === 'true';
}
/** Convert a string to a URL-safe slug (lowercase, spaces to hyphens, strip special chars). */
function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}
/** Build a slugified version of a Record<locale, string> title map. */
function slugifyTranslations(titles: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [locale, title] of Object.entries(titles)) {
        result[locale] = slugify(title);
    }
    return result;
}
/** Build a { en: { ...fields }, de: { ...fields } } translation object from named Record<string,string> fields. */
function buildTranslations(fields: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
    const locales = new Set<string>();
    for (const dict of Object.values(fields)) {
        for (const locale of Object.keys(dict)) locales.add(locale);
    }
    const result: Record<string, Record<string, string>> = {};
    for (const locale of locales) {
        result[locale] = {};
        for (const [fieldName, dict] of Object.entries(fields)) {
            result[locale][fieldName] = dict[locale] ?? dict['en'] ?? dict['de'] ?? '';
        }
    }
    return result;
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
    /** Optional ERP custom fields (GTIN, brand, weight, minOrderQty, etc.) */
    customFields?: Record<string, unknown>;
    /** ISO timestamp: if set, product is considered deleted in ERP */
    deletedAt?: string;
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

interface Customer {
    id: number;
    email: string;
    firstName: Record<string, string>;
    lastName: Record<string, string>;
    phone?: string;
    company?: string;
    vatNumber?: string;
    groups: string[];
    addresses: Array<{
        streetLine1: string;
        streetLine2?: string;
        city: string;
        postalCode: string;
        countryCode: string;
        province?: string;
        company?: string;
        defaultShipping?: boolean;
        defaultBilling?: boolean;
    }>;
    active: boolean;
    createdAt: string;
    updatedAt?: string;
    deletedAt?: string;
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
    // ERP-added facets
    {
        code: 'brand',
        name: { de: 'Marke', en: 'Brand', fr: 'Marque' },
        values: [
            { code: 'safetypro', name: { de: 'SafetyPro', en: 'SafetyPro', fr: 'SafetyPro' } },
            { code: 'labmaster', name: { de: 'LabMaster', en: 'LabMaster', fr: 'LabMaster' } },
            { code: 'proshield', name: { de: 'ProShield', en: 'ProShield', fr: 'ProShield' } },
        ],
    },
    {
        code: 'ppe-standard',
        name: { de: 'PSA-Norm', en: 'PPE Standard', fr: 'Norme EPI' },
        values: [
            { code: 'en-iso-11611', name: { de: 'EN ISO 11611', en: 'EN ISO 11611', fr: 'EN ISO 11611' } },
            { code: 'en-iso-11612', name: { de: 'EN ISO 11612', en: 'EN ISO 11612', fr: 'EN ISO 11612' } },
            { code: 'en-388', name: { de: 'EN 388', en: 'EN 388', fr: 'EN 388' } },
            { code: 'en-420', name: { de: 'EN 420', en: 'EN 420', fr: 'EN 420' } },
        ],
    },
    {
        code: 'segment',
        name: { de: 'Kundensegment', en: 'Customer Segment', fr: 'Segment client' },
        values: [
            { code: 'retail', name: { de: 'Einzelhandel', en: 'Retail', fr: 'Détail' } },
            { code: 'wholesale', name: { de: 'Großhandel', en: 'Wholesale', fr: 'Gros' } },
            { code: 'enterprise', name: { de: 'Enterprise', en: 'Enterprise', fr: 'Entreprise' } },
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
    // ERP-added category hierarchy for ISK product
    { code: 'ppe-kits', name: { de: 'PSA-Kits', en: 'PPE Kits', fr: 'Kits EPI' }, description: { de: 'Komplette Sets für persönliche Schutzausrüstung', en: 'Complete sets for personal protective equipment', fr: 'Ensembles complets d\'équipements de protection individuelle' }, parentCode: 'safety-equipment', sortOrder: 10 },
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
    { code: 'web', name: { de: 'Webshop', en: 'Webshop', fr: 'Boutique en ligne' }, defaultLanguage: 'de', languages: ['de', 'en', 'fr'], defaultCurrency: 'EUR', currencies: ['EUR', 'USD', 'CHF', 'GBP'] },
    { code: 'b2b', name: { de: 'B2B Portal', en: 'B2B Portal', fr: 'Portail B2B' }, defaultLanguage: 'de', languages: ['de', 'en', 'fr'], defaultCurrency: 'EUR', currencies: ['EUR', 'USD', 'GBP'] },
    { code: 'uk-store', name: { de: 'UK Shop', en: 'UK Store', fr: 'Boutique UK' }, defaultLanguage: 'en', languages: ['en'], defaultCurrency: 'GBP', currencies: ['GBP', 'EUR'] },
];

// ── Customers ───────────────────────────────────────────────────────────────
const customers: Customer[] = [
    {
        id: 5001, email: 'max.mustermann@labtech.de',
        firstName: { de: 'Max', en: 'Max' }, lastName: { de: 'Mustermann', en: 'Mustermann' },
        phone: '+49 30 12345678', company: 'LabTech GmbH',
        groups: ['B2B', 'Premium'],
        addresses: [
            { streetLine1: 'Laborstraße 42', city: 'Berlin', postalCode: '10115', countryCode: 'DE', province: 'Berlin', company: 'LabTech GmbH', defaultShipping: true, defaultBilling: true },
        ],
        active: true, createdAt: '2024-01-15T10:00:00Z',
    },
    {
        id: 5002, email: 'sarah.schmidt@uniklinik.de',
        firstName: { de: 'Sarah', en: 'Sarah' }, lastName: { de: 'Schmidt', en: 'Schmidt' },
        phone: '+49 89 98765432', company: 'Universitätsklinik München',
        groups: ['B2B', 'Medical'],
        addresses: [
            { streetLine1: 'Klinikweg 7', city: 'München', postalCode: '80333', countryCode: 'DE', province: 'Bayern', company: 'Universitätsklinik München', defaultShipping: true, defaultBilling: true },
            { streetLine1: 'Rechnungsabteilung, Postfach 1234', city: 'München', postalCode: '80331', countryCode: 'DE', defaultBilling: false },
        ],
        active: true, createdAt: '2024-03-22T14:30:00Z',
    },
    {
        id: 5003, email: 'john.doe@research-inc.com',
        firstName: { de: 'John', en: 'John' }, lastName: { de: 'Doe', en: 'Doe' },
        phone: '+1 555 0123', company: 'Research Inc.',
        groups: ['B2B'],
        addresses: [
            { streetLine1: '123 Science Blvd', streetLine2: 'Suite 400', city: 'Boston', postalCode: '02101', countryCode: 'US', province: 'MA', company: 'Research Inc.', defaultShipping: true, defaultBilling: true },
        ],
        active: true, createdAt: '2024-06-10T09:15:00Z',
    },
    {
        id: 5004, email: 'lisa.weber@privat.de',
        firstName: { de: 'Lisa', en: 'Lisa' }, lastName: { de: 'Weber', en: 'Weber' },
        phone: '+49 40 55667788',
        groups: ['Retail'],
        addresses: [
            { streetLine1: 'Hauptstraße 15', city: 'Hamburg', postalCode: '20095', countryCode: 'DE', defaultShipping: true, defaultBilling: true },
        ],
        active: true, createdAt: '2025-01-05T16:45:00Z',
    },
    {
        id: 5005, email: 'inactive@oldcompany.de',
        firstName: { de: 'Hans', en: 'Hans' }, lastName: { de: 'Müller', en: 'Mueller' },
        phone: '+49 711 11223344', company: 'Old Company GmbH',
        groups: ['B2B'],
        addresses: [
            { streetLine1: 'Alte Gasse 99', city: 'Stuttgart', postalCode: '70173', countryCode: 'DE', defaultShipping: true, defaultBilling: true },
        ],
        active: false, createdAt: '2023-06-01T08:00:00Z',
    },
    {
        id: 5006, email: 'anna.becker@pharma-logistics.de',
        firstName: { de: 'Anna', en: 'Anna' }, lastName: { de: 'Becker', en: 'Becker' },
        phone: '+49 221 9876543', company: 'Pharma Logistics AG',
        groups: ['B2B'],
        addresses: [
            { streetLine1: 'Industriestraße 88', city: 'Köln', postalCode: '50667', countryCode: 'DE', province: 'Nordrhein-Westfalen', company: 'Pharma Logistics AG', defaultShipping: true, defaultBilling: false },
            { streetLine1: 'Finanzabteilung, Postfach 5500', city: 'Köln', postalCode: '50668', countryCode: 'DE', company: 'Pharma Logistics AG', defaultShipping: false, defaultBilling: true },
            { streetLine1: 'Ferienhaus Am See 3', city: 'Konstanz', postalCode: '78462', countryCode: 'DE', province: 'Baden-Württemberg', defaultShipping: false, defaultBilling: false },
        ],
        active: true, createdAt: '2024-08-12T11:30:00Z',
    },
    {
        id: 5007, email: 'francois.mueller-levy@gmail.com',
        firstName: { de: 'François', en: 'François' }, lastName: { de: 'Müller-Lévy', en: 'Müller-Lévy' },
        phone: '+33 1 23456789',
        groups: ['Retail'],
        addresses: [
            { streetLine1: '14 Rue de la Paix', city: 'Strasbourg', postalCode: '67000', countryCode: 'FR', defaultShipping: true, defaultBilling: true },
        ],
        active: true, createdAt: '2025-03-18T09:00:00Z',
    },
    {
        id: 5008, email: 'juergen.boehm@tu-dresden.de',
        firstName: { de: 'Jürgen', en: 'Juergen' }, lastName: { de: 'Böhm', en: 'Boehm' },
        phone: '+49 351 4567890', company: 'TU Dresden',
        groups: ['B2B'],
        addresses: [
            { streetLine1: 'Helmholtzstraße 10', city: 'Dresden', postalCode: '01069', countryCode: 'DE', province: 'Sachsen', company: 'TU Dresden, Institut für Chemie', defaultShipping: true, defaultBilling: true },
        ],
        active: true, createdAt: '2025-06-01T14:00:00Z',
    },
    // ── ERP Enterprise Customer Segments (3 groups: retail / wholesale / enterprise) ──
    // Wholesale customers (DE)
    {
        id: 5009, email: 'procurement@industrial-supplies.de',
        firstName: { de: 'Klaus', en: 'Klaus' }, lastName: { de: 'Hoffmann', en: 'Hoffmann' },
        phone: '+49 30 99887766', company: 'Industrial Supplies GmbH',
        groups: ['wholesale'],
        addresses: [
            { streetLine1: 'Gewerbepark 12', city: 'Berlin', postalCode: '12355', countryCode: 'DE', province: 'Berlin', company: 'Industrial Supplies GmbH', defaultShipping: true, defaultBilling: true },
        ],
        active: true, createdAt: '2025-08-01T09:00:00Z',
    },
    {
        id: 5010, email: 'einkauf@chemikal-wholesale.de',
        firstName: { de: 'Monika', en: 'Monika' }, lastName: { de: 'Richter', en: 'Richter' },
        phone: '+49 89 11223344', company: 'Chemikal Wholesale AG',
        groups: ['wholesale'],
        addresses: [
            { streetLine1: 'Großhandelsstraße 55', city: 'München', postalCode: '80637', countryCode: 'DE', province: 'Bayern', company: 'Chemikal Wholesale AG', defaultShipping: true, defaultBilling: true },
            { streetLine1: 'Lagerstraße 3', city: 'Augsburg', postalCode: '86150', countryCode: 'DE', company: 'Chemikal Wholesale Lager', defaultShipping: false, defaultBilling: false },
        ],
        active: true, createdAt: '2025-09-15T11:00:00Z',
    },
    // Enterprise customers (US, DE, GB — different countries)
    {
        id: 5011, email: 'supply.chain@globallab-corp.com',
        firstName: { de: 'Patricia', en: 'Patricia' }, lastName: { de: 'O\'Brien', en: 'O\'Brien' },
        phone: '+1 617 555 9900', company: 'GlobalLab Corporation',
        groups: ['enterprise'],
        addresses: [
            { streetLine1: '500 Innovation Drive', streetLine2: 'Building C', city: 'Cambridge', postalCode: '02139', countryCode: 'US', province: 'MA', company: 'GlobalLab Corporation', defaultShipping: true, defaultBilling: true },
        ],
        active: true, createdAt: '2025-10-01T14:00:00Z',
    },
    {
        id: 5012, email: 'orders@lab-enterprise.co.uk',
        firstName: { de: 'James', en: 'James' }, lastName: { de: 'Harrison', en: 'Harrison' },
        phone: '+44 20 7946 0958', company: 'Lab Enterprise Ltd',
        groups: ['enterprise'],
        addresses: [
            { streetLine1: '42 Science Park', city: 'London', postalCode: 'SW1A 2AA', countryCode: 'GB', province: 'England', company: 'Lab Enterprise Ltd', defaultShipping: true, defaultBilling: true },
        ],
        active: true, createdAt: '2025-10-20T10:00:00Z',
    },
    {
        id: 5013, email: 'beschaffung@dax-chemicals.de',
        firstName: { de: 'Ingrid', en: 'Ingrid' }, lastName: { de: 'Zimmermann', en: 'Zimmermann' },
        phone: '+49 69 30456789', company: 'DAX Chemicals AG',
        groups: ['enterprise'],
        addresses: [
            { streetLine1: 'Mainzer Landstraße 200', city: 'Frankfurt', postalCode: '60327', countryCode: 'DE', province: 'Hessen', company: 'DAX Chemicals AG', defaultShipping: true, defaultBilling: false },
            { streetLine1: 'Rechtsabteilung, Theodor-Heuss-Allee 2', city: 'Frankfurt', postalCode: '60486', countryCode: 'DE', company: 'DAX Chemicals AG', defaultShipping: false, defaultBilling: true },
        ],
        active: true, createdAt: '2025-11-01T08:00:00Z',
    },
    // Retail customers (B2C — different countries)
    {
        id: 5014, email: 'marie.dupont@free.fr',
        firstName: { de: 'Marie', en: 'Marie' }, lastName: { de: 'Dupont', en: 'Dupont' },
        phone: '+33 6 12345678',
        groups: ['retail'],
        addresses: [
            { streetLine1: '8 Avenue des Sciences', city: 'Lyon', postalCode: '69003', countryCode: 'FR', defaultShipping: true, defaultBilling: true },
        ],
        active: true, createdAt: '2025-12-01T10:00:00Z',
    },
    {
        id: 5015, email: 'thomas.blake@gmail.com',
        firstName: { de: 'Thomas', en: 'Thomas' }, lastName: { de: 'Blake', en: 'Blake' },
        phone: '+44 7700 900123',
        groups: ['retail'],
        addresses: [
            { streetLine1: '7 Whitechapel Road', city: 'Manchester', postalCode: 'M1 1JN', countryCode: 'GB', province: 'England', defaultShipping: true, defaultBilling: true },
        ],
        active: true, createdAt: '2026-01-10T15:00:00Z',
    },
    // Deactivated customer (B2B — simulates customer offboarding)
    {
        id: 5016, email: 'old.account@legacy-supplier.de',
        firstName: { de: 'Herbert', en: 'Herbert' }, lastName: { de: 'Braun', en: 'Braun' },
        phone: '+49 211 88776655', company: 'Legacy Supplier GmbH (insolvency)',
        groups: ['wholesale'],
        addresses: [
            { streetLine1: 'Aufgelöst-Straße 1', city: 'Düsseldorf', postalCode: '40210', countryCode: 'DE', company: 'Legacy Supplier GmbH', defaultShipping: true, defaultBilling: true },
        ],
        active: false, createdAt: '2023-03-01T08:00:00Z',
    },
    // Wholesale with VAT/company — B2B fields test
    {
        id: 5017, email: 'orders@swiss-lab-supply.ch',
        firstName: { de: 'Stefan', en: 'Stefan' }, lastName: { de: 'Meier', en: 'Meier' },
        phone: '+41 44 1234567', company: 'Swiss Lab Supply GmbH',
        groups: ['wholesale', 'enterprise'],
        addresses: [
            { streetLine1: 'Bahnhofstrasse 100', city: 'Zürich', postalCode: '8001', countryCode: 'CH', province: 'Zürich', company: 'Swiss Lab Supply GmbH', defaultShipping: true, defaultBilling: true },
        ],
        active: true, createdAt: '2026-01-15T12:00:00Z',
    },
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
    // 12: Single — Isopropanol (distinct English slug to avoid collision with Ethanol slug normalization)
    {
        id: 1012, itemNumber: 'LS-CHM-002', type: 'product',
        title: { de: 'Isopropanol p.a.', en: 'Isopropanol Pro Analysis' },
        subtitle: { de: 'Zur Analyse', en: 'For analysis' },
        shortDescription: { de: 'Isopropanol zur Analyse, ≥99.8%', en: 'Isopropanol for analysis, ≥99.8%' },
        description: { de: '<p>Isopropanol p.a. (zur Analyse) ≥99.8%. 1L Braunglasflasche.</p>', en: '<p>Isopropanol Pro Analysis (for analysis) ≥99.8%. 1L amber glass bottle.</p>' },
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
    // ── ERP ENTERPRISE SCENARIOS ─────────────────────────────────────────────
    // 25: B2B Industrial Safety Kit — complex option groups (size × color × material), 15 variants, EN/DE/FR, customFields, price tiers
    {
        id: 1025, itemNumber: 'ISK-PRO-001', type: 'group',
        title: { de: 'Industrielles Sicherheitskit Professional', en: 'Industrial Safety Kit Professional', fr: 'Kit de sécurité industrielle Professionnel' },
        subtitle: { de: 'Vollständiger persönlicher Schutz für die Industrie', en: 'Complete personal protection for industry', fr: 'Protection personnelle complète pour l\'industrie' },
        shortDescription: { de: 'Professionelles Sicherheitskit für industrielle Umgebungen – EN-ISO-11611 zertifiziert', en: 'Professional safety kit for industrial environments – EN-ISO-11611 certified', fr: 'Kit de sécurité professionnel pour environnements industriels – certifié EN-ISO-11611' },
        description: { de: '<p>Das <strong>Industrial Safety Kit Professional</strong> von SafetyPro vereint alle notwendigen Schutzkomponenten für den industriellen Einsatz. Verfügbar in 5 Größen, 3 Farben und 3 Materialvarianten – insgesamt 15 Kombinationen. Mindestabenahme 10 Einheiten. GTIN: 4012345678901.</p>', en: '<p>The <strong>Industrial Safety Kit Professional</strong> by SafetyPro combines all necessary protective components for industrial use. Available in 5 sizes, 3 colors, and 3 material variants – 15 combinations total. Minimum order quantity: 10 units. GTIN: 4012345678901.</p>', fr: '<p>Le <strong>Kit de sécurité industrielle Professionnel</strong> de SafetyPro combine tous les composants de protection nécessaires pour un usage industriel. Disponible en 5 tailles, 3 couleurs et 3 variantes de matériaux – 15 combinaisons au total. Quantité minimale de commande : 10 unités. GTIN : 4012345678901.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'safety-equipment',
        facetCodes: ['certification:ce', 'application:industrie', 'application:labor'],
        assets: [
            mkAsset('isk-pro-main', 'ISK PRO Main Image', 'image'),
            mkAsset('isk-pro-gallery-1', 'ISK PRO Gallery 1', 'image'),
            mkAsset('isk-pro-gallery-2', 'ISK PRO Gallery 2', 'image'),
            mkAsset('isk-pro-gallery-3', 'ISK PRO Gallery 3', 'image'),
        ],
        modifiedAt: new Date('2026-02-28T08:00:00Z').toISOString(),
        variants: [
            // Size S × 3 colors (cotton only for small sizes)
            { itemNumber: 'ISK-PRO-S-YEL-COT', title: { de: 'Sicherheitskit S Gelb Baumwolle', en: 'Safety Kit S Yellow Cotton', fr: 'Kit de Sécurité S Jaune Coton' }, attributes: { size: 'S', color: 'yellow', material: 'cotton' }, price: { EUR: 89.90, USD: 98.90, GBP: 76.90 }, stock: { Hauptlager: 500, Aussenlager: 200 }, assets: [], published: true },
            { itemNumber: 'ISK-PRO-S-ORG-COT', title: { de: 'Sicherheitskit S Orange Baumwolle', en: 'Safety Kit S Orange Cotton', fr: 'Kit de Sécurité S Orange Coton' }, attributes: { size: 'S', color: 'orange', material: 'cotton' }, price: { EUR: 89.90, USD: 98.90, GBP: 76.90 }, stock: { Hauptlager: 400, Aussenlager: 150 }, assets: [], published: true },
            { itemNumber: 'ISK-PRO-S-RED-COT', title: { de: 'Sicherheitskit S Rot Baumwolle', en: 'Safety Kit S Red Cotton', fr: 'Kit de Sécurité S Rouge Coton' }, attributes: { size: 'S', color: 'red', material: 'cotton' }, price: { EUR: 89.90, USD: 98.90, GBP: 76.90 }, stock: { Hauptlager: 300, Aussenlager: 100 }, assets: [], published: true },
            // Size M × 3 materials
            { itemNumber: 'ISK-PRO-M-YEL-COT', title: { de: 'Sicherheitskit M Gelb Baumwolle', en: 'Safety Kit M Yellow Cotton', fr: 'Kit de Sécurité M Jaune Coton' }, attributes: { size: 'M', color: 'yellow', material: 'cotton' }, price: { EUR: 94.90, USD: 104.90, GBP: 80.90 }, stock: { Hauptlager: 600, Aussenlager: 250 }, assets: [], published: true },
            { itemNumber: 'ISK-PRO-M-YEL-KEV', title: { de: 'Sicherheitskit M Gelb Kevlar', en: 'Safety Kit M Yellow Kevlar', fr: 'Kit de Sécurité M Jaune Kevlar' }, attributes: { size: 'M', color: 'yellow', material: 'kevlar' }, price: { EUR: 149.90, USD: 164.90, GBP: 127.90 }, stock: { Hauptlager: 200, Aussenlager: 80 }, assets: [], published: true },
            { itemNumber: 'ISK-PRO-M-YEL-POL', title: { de: 'Sicherheitskit M Gelb Polyester', en: 'Safety Kit M Yellow Polyester', fr: 'Kit de Sécurité M Jaune Polyester' }, attributes: { size: 'M', color: 'yellow', material: 'polyester' }, price: { EUR: 109.90, USD: 120.90, GBP: 93.90 }, stock: { Hauptlager: 350, Aussenlager: 120 }, assets: [], published: true },
            // Size L × 3 materials
            { itemNumber: 'ISK-PRO-L-ORG-COT', title: { de: 'Sicherheitskit L Orange Baumwolle', en: 'Safety Kit L Orange Cotton', fr: 'Kit de Sécurité L Orange Coton' }, attributes: { size: 'L', color: 'orange', material: 'cotton' }, price: { EUR: 97.90, USD: 107.90, GBP: 83.90 }, stock: { Hauptlager: 500, Aussenlager: 200 }, assets: [], published: true },
            { itemNumber: 'ISK-PRO-L-ORG-KEV', title: { de: 'Sicherheitskit L Orange Kevlar', en: 'Safety Kit L Orange Kevlar', fr: 'Kit de Sécurité L Orange Kevlar' }, attributes: { size: 'L', color: 'orange', material: 'kevlar' }, price: { EUR: 159.90, USD: 175.90, GBP: 135.90 }, stock: { Hauptlager: 180, Aussenlager: 60 }, assets: [], published: true },
            { itemNumber: 'ISK-PRO-L-ORG-POL', title: { de: 'Sicherheitskit L Orange Polyester', en: 'Safety Kit L Orange Polyester', fr: 'Kit de Sécurité L Orange Polyester' }, attributes: { size: 'L', color: 'orange', material: 'polyester' }, price: { EUR: 112.90, USD: 124.90, GBP: 95.90 }, stock: { Hauptlager: 400, Aussenlager: 150 }, assets: [], published: true },
            // Size XL × 3 colors/materials (premium)
            { itemNumber: 'ISK-PRO-XL-RED-COT', title: { de: 'Sicherheitskit XL Rot Baumwolle', en: 'Safety Kit XL Red Cotton', fr: 'Kit de Sécurité XL Rouge Coton' }, attributes: { size: 'XL', color: 'red', material: 'cotton' }, price: { EUR: 102.90, USD: 113.90, GBP: 87.90 }, stock: { Hauptlager: 300, Aussenlager: 100 }, assets: [], published: true },
            { itemNumber: 'ISK-PRO-XL-RED-KEV', title: { de: 'Sicherheitskit XL Rot Kevlar', en: 'Safety Kit XL Red Kevlar', fr: 'Kit de Sécurité XL Rouge Kevlar' }, attributes: { size: 'XL', color: 'red', material: 'kevlar' }, price: { EUR: 169.90, USD: 186.90, GBP: 144.90 }, stock: { Hauptlager: 150, Aussenlager: 50 }, assets: [], published: true },
            { itemNumber: 'ISK-PRO-XL-RED-POL', title: { de: 'Sicherheitskit XL Rot Polyester', en: 'Safety Kit XL Red Polyester', fr: 'Kit de Sécurité XL Rouge Polyester' }, attributes: { size: 'XL', color: 'red', material: 'polyester' }, price: { EUR: 119.90, USD: 131.90, GBP: 101.90 }, stock: { Hauptlager: 280, Aussenlager: 90 }, assets: [], published: true },
            // Size XXL × 3 materials (premium tier)
            { itemNumber: 'ISK-PRO-XXL-YEL-COT', title: { de: 'Sicherheitskit XXL Gelb Baumwolle', en: 'Safety Kit XXL Yellow Cotton', fr: 'Kit de Sécurité XXL Jaune Coton' }, attributes: { size: 'XXL', color: 'yellow', material: 'cotton' }, price: { EUR: 109.90, USD: 120.90, GBP: 93.90 }, stock: { Hauptlager: 200, Aussenlager: 80 }, assets: [], published: true },
            { itemNumber: 'ISK-PRO-XXL-YEL-KEV', title: { de: 'Sicherheitskit XXL Gelb Kevlar', en: 'Safety Kit XXL Yellow Kevlar', fr: 'Kit de Sécurité XXL Jaune Kevlar' }, attributes: { size: 'XXL', color: 'yellow', material: 'kevlar' }, price: { EUR: 179.90, USD: 197.90, GBP: 152.90 }, stock: { Hauptlager: 100, Aussenlager: 40 }, assets: [], published: true },
            { itemNumber: 'ISK-PRO-XXL-ORG-POL', title: { de: 'Sicherheitskit XXL Orange Polyester', en: 'Safety Kit XXL Orange Polyester', fr: 'Kit de Sécurité XXL Orange Polyester' }, attributes: { size: 'XXL', color: 'orange', material: 'polyester' }, price: { EUR: 129.90, USD: 142.90, GBP: 110.90 }, stock: { Hauptlager: 160, Aussenlager: 60 }, assets: [], published: true },
        ],
        customFields: { gtin: '4012345678901', brand: 'SafetyPro', weightGrams: 1200, minOrderQty: 10, erpId: '1025', certification: 'EN-ISO-11611', b2bDiscount: 20 },
    },
    // 26: Product to be deleted (deleted product — ERP delete sync test)
    {
        id: 1026, itemNumber: 'LS-DEL-001', type: 'product',
        title: { de: 'Gelöschtes Produkt Alpha (ERP Test)', en: 'Deleted Product Alpha (ERP Test)' },
        subtitle: { de: 'Wird gelöscht', en: 'Marked for deletion' },
        shortDescription: { de: 'Testprodukt für ERP-Löschsynchronisation', en: 'Test product for ERP deletion sync' },
        description: { de: '<p>Dieses Produkt wurde im ERP-System gelöscht und soll auch in Vendure gelöscht werden.</p>', en: '<p>This product was deleted in the ERP system and should be deleted in Vendure as well.</p>' },
        channels: ['web'], published: false,
        categoryCode: 'laboratory-equipment', facetCodes: [],
        assets: [],
        modifiedAt: new Date('2026-03-01T10:00:00Z').toISOString(),
        deletedAt: '2026-03-01T10:00:00Z',
        variants: [
            { itemNumber: 'LS-DEL-001', title: { de: 'Gelöscht Alpha', en: 'Deleted Alpha' }, attributes: {}, price: { EUR: 0 }, stock: {}, assets: [], published: false, deletedAt: '2026-03-01T10:00:00Z' },
        ],
    },
    // 27: Product to be deleted (ERP test 2)
    {
        id: 1027, itemNumber: 'LS-DEL-002', type: 'product',
        title: { de: 'Gelöschtes Produkt Beta (ERP Test)', en: 'Deleted Product Beta (ERP Test)' },
        subtitle: { de: 'Auslaufartikel', en: 'End-of-life product' },
        shortDescription: { de: 'Ausgelaufenes Produkt – wird aus dem Katalog entfernt', en: 'End-of-life product – being removed from catalog' },
        description: { de: '<p>Auslaufendes Produkt. Bestand aufgebraucht, kein Nachkauf.</p>', en: '<p>End-of-life product. Stock exhausted, no reorder.</p>' },
        channels: ['b2b'], published: false,
        categoryCode: 'containers', facetCodes: [],
        assets: [],
        modifiedAt: new Date('2026-03-01T10:00:00Z').toISOString(),
        deletedAt: '2026-03-01T10:00:00Z',
        variants: [
            { itemNumber: 'LS-DEL-002-A', title: { de: 'Auslaufend A', en: 'EOL A' }, attributes: { size: 'A' }, price: { EUR: 0 }, stock: {}, assets: [], published: false, deletedAt: '2026-03-01T10:00:00Z' },
            { itemNumber: 'LS-DEL-002-B', title: { de: 'Auslaufend B', en: 'EOL B' }, attributes: { size: 'B' }, price: { EUR: 0 }, stock: {}, assets: [], published: false, deletedAt: '2026-03-01T10:00:00Z' },
        ],
    },
    // 28: Product with 2 discontinued variants (product still active)
    {
        id: 1028, itemNumber: 'LS-DISC-001', type: 'group',
        title: { de: 'Teilweise eingestellte Produktreihe', en: 'Partially Discontinued Product Line', fr: 'Gamme partiellement abandonnée' },
        subtitle: { de: 'Einige Varianten eingestellt', en: 'Some variants discontinued', fr: 'Certaines variantes abandonnées' },
        shortDescription: { de: 'Aktives Produkt mit eingestellten Varianten (ERP Sync Test)', en: 'Active product with discontinued variants (ERP sync test)', fr: 'Produit actif avec variantes abandonnées (test sync ERP)' },
        description: { de: '<p>Dieses Produkt ist aktiv, aber bestimmte Varianten wurden eingestellt. Demonstriert teilweises ERP-Löschverhalten.</p>', en: '<p>This product is active but certain variants have been discontinued. Demonstrates partial ERP deletion behavior.</p>', fr: '<p>Ce produit est actif mais certaines variantes ont été abandonnées. Démontre le comportement de suppression ERP partielle.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'filters-membranes', facetCodes: ['material:nylon', 'application:labor'],
        assets: [mkAsset('disc-product-main', 'Partially Discontinued Product')],
        modifiedAt: new Date('2026-03-01T10:00:00Z').toISOString(),
        variants: [
            { itemNumber: 'LS-DISC-001-A', title: { de: 'Aktive Variante A', en: 'Active Variant A', fr: 'Variante Active A' }, attributes: { size: 'standard' }, price: { EUR: 55.00, USD: 60.50, GBP: 47.00 }, stock: { Hauptlager: 300, Aussenlager: 100 }, assets: [], published: true },
            { itemNumber: 'LS-DISC-001-B', title: { de: 'Eingestellte Variante B (Auslauf)', en: 'Discontinued Variant B (EOL)', fr: 'Variante Abandonnée B (EOL)' }, attributes: { size: 'large' }, price: { EUR: 65.00, USD: 71.50 }, stock: {}, assets: [], published: false, deletedAt: '2026-03-01T10:00:00Z' },
            { itemNumber: 'LS-DISC-001-C', title: { de: 'Eingestellte Variante C (Auslauf)', en: 'Discontinued Variant C (EOL)', fr: 'Variante Abandonnée C (EOL)' }, attributes: { size: 'xlarge' }, price: { EUR: 75.00, USD: 82.50 }, stock: {}, assets: [], published: false, deletedAt: '2026-03-01T09:00:00Z' },
        ],
    },
    // ── ENHANCED TEST PRODUCTS FOR PHASE 2 ───────────────────────────────────
    // 17: Product A — Multi-language (de, en, fr), Multi-channel (all 3), Multi-currency (4 currencies), Multiple assets
    {
        id: 1017, itemNumber: 'LS-TEST-A', type: 'product',
        title: { de: 'Universal-Testprodukt Alpha', en: 'Universal Test Product Alpha', fr: 'Produit de test universel Alpha' },
        subtitle: { de: 'Mehrsprachig und Multi-Kanal', en: 'Multi-language and Multi-channel', fr: 'Multilingue et multicanal' },
        shortDescription: { de: 'Testprodukt für alle Sprachen, Kanäle und Währungen', en: 'Test product for all languages, channels and currencies', fr: 'Produit test pour toutes les langues, canaux et devises' },
        description: { de: '<p>Dieses Produkt testet alle Kombinationen: 3 Sprachen (de, en, fr), 3 Kanäle (web, b2b, uk-store), 4 Währungen (EUR, USD, GBP, CHF).</p>', en: '<p>This product tests all combinations: 3 languages (de, en, fr), 3 channels (web, b2b, uk-store), 4 currencies (EUR, USD, GBP, CHF).</p>', fr: '<p>Ce produit teste toutes les combinaisons : 3 langues (de, en, fr), 3 canaux (web, b2b, uk-store), 4 devises (EUR, USD, GBP, CHF).</p>' },
        channels: ['web', 'b2b', 'uk-store'], published: true,
        categoryCode: 'laboratory-equipment', facetCodes: ['certification:ce', 'certification:iso-9001', 'application:labor', 'application:forschung'],
        assets: [
            mkAsset('test-a-main', 'Test Product Alpha Main', 'image'),
            mkAsset('test-a-detail-1', 'Test Product Alpha Detail 1', 'image'),
            mkAsset('test-a-detail-2', 'Test Product Alpha Detail 2', 'image'),
            mkAsset('test-a-detail-3', 'Test Product Alpha Detail 3', 'image'),
            mkAsset('test-a-detail-4', 'Test Product Alpha Detail 4', 'image'),
            mkAsset('test-a-detail-5', 'Test Product Alpha Detail 5', 'image'),
            mkAsset('test-a-detail-6', 'Test Product Alpha Detail 6', 'image'),
            mkAsset('test-a-detail-7', 'Test Product Alpha Detail 7', 'image'),
            mkAsset('test-a-detail-8', 'Test Product Alpha Detail 8', 'image'),
            mkAsset('test-a-detail-9', 'Test Product Alpha Detail 9', 'image'),
            mkAsset('test-a-detail-10', 'Test Product Alpha Detail 10', 'image'),
        ],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-TEST-A', title: { de: 'Test Alpha', en: 'Test Alpha', fr: 'Test Alpha' }, attributes: {}, price: { EUR: 99.99, USD: 109.99, GBP: 89.99, CHF: 99.99 }, stock: { Hauptlager: 100, Aussenlager: 50 }, assets: [], published: true },
        ],
    },
    // 18: Product B — Simple case (2 languages, 1 channel, 1 currency)
    {
        id: 1018, itemNumber: 'LS-TEST-B', type: 'product',
        title: { de: 'Einfaches Testprodukt Beta', en: 'Simple Test Product Beta' },
        subtitle: { de: 'Minimale Konfiguration', en: 'Minimal configuration' },
        shortDescription: { de: 'Nur DE+EN, nur Web-Kanal, nur EUR', en: 'Only DE+EN, only web channel, only EUR' },
        description: { de: '<p>Einfaches Testprodukt mit minimaler Konfiguration: 2 Sprachen (de, en), 1 Kanal (web), 1 Währung (EUR).</p>', en: '<p>Simple test product with minimal configuration: 2 languages (de, en), 1 channel (web), 1 currency (EUR).</p>' },
        channels: ['web'], published: true,
        categoryCode: 'containers', facetCodes: ['material:edelstahl'],
        assets: [mkAsset('test-b-main', 'Test Product Beta')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-TEST-B', title: { de: 'Test Beta', en: 'Test Beta' }, attributes: {}, price: { EUR: 49.99 }, stock: { Hauptlager: 200 }, assets: [], published: true },
        ],
    },
    // 19: Product C — Unpublished (published: false)
    {
        id: 1019, itemNumber: 'LS-TEST-C', type: 'product',
        title: { de: 'Unveröffentlichtes Testprodukt Gamma', en: 'Unpublished Test Product Gamma', fr: 'Produit test non publié Gamma' },
        subtitle: { de: 'Nicht veröffentlicht', en: 'Not published', fr: 'Non publié' },
        shortDescription: { de: 'Testprodukt für unpublished-Filterung', en: 'Test product for unpublished filtering', fr: 'Produit test pour filtrage non publié' },
        description: { de: '<p>Dieses Produkt ist unveröffentlicht und sollte nur mit includeUnpublished=true erscheinen.</p>', en: '<p>This product is unpublished and should only appear with includeUnpublished=true.</p>', fr: '<p>Ce produit est non publié et ne devrait apparaître qu\'avec includeUnpublished=true.</p>' },
        channels: ['web', 'b2b'], published: false,
        categoryCode: 'pipettes', facetCodes: ['certification:glp'],
        assets: [mkAsset('test-c-main', 'Test Product Gamma')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-TEST-C', title: { de: 'Test Gamma', en: 'Test Gamma', fr: 'Test Gamma' }, attributes: {}, price: { EUR: 75.00, USD: 82.00 }, stock: { Hauptlager: 50 }, assets: [], published: false },
        ],
    },
    // 20: Product D — 10+ assets for testing REPLACE_ALL vs APPEND_ONLY modes, Multiple variants with different asset sets
    {
        id: 1020, itemNumber: 'LS-TEST-D', type: 'group',
        title: { de: 'Asset-Testprodukt Delta', en: 'Asset Test Product Delta', fr: 'Produit test Asset Delta' },
        subtitle: { de: 'Viele Assets zum Testen', en: 'Many assets for testing', fr: 'Nombreux assets pour tests' },
        shortDescription: { de: 'Produkt mit 15 Assets zum Testen von Asset-Modi', en: 'Product with 15 assets for testing asset modes', fr: 'Produit avec 15 assets pour tester les modes asset' },
        description: { de: '<p>Testprodukt mit vielen Assets: Produkt-Level hat 15 Assets, Varianten haben eigene Assets für REPLACE_ALL vs APPEND_ONLY Tests.</p>', en: '<p>Test product with many assets: Product-level has 15 assets, variants have their own assets for REPLACE_ALL vs APPEND_ONLY tests.</p>', fr: '<p>Produit test avec nombreux assets : niveau produit a 15 assets, les variantes ont leurs propres assets pour tests REPLACE_ALL vs APPEND_ONLY.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'laboratory-equipment', facetCodes: ['certification:ce', 'application:labor'],
        assets: [
            mkAsset('test-d-featured', 'Test Delta Featured', 'image'),
            mkAsset('test-d-gallery-1', 'Test Delta Gallery 1', 'image'),
            mkAsset('test-d-gallery-2', 'Test Delta Gallery 2', 'image'),
            mkAsset('test-d-gallery-3', 'Test Delta Gallery 3', 'image'),
            mkAsset('test-d-gallery-4', 'Test Delta Gallery 4', 'image'),
            mkAsset('test-d-gallery-5', 'Test Delta Gallery 5', 'image'),
            mkAsset('test-d-gallery-6', 'Test Delta Gallery 6', 'image'),
            mkAsset('test-d-gallery-7', 'Test Delta Gallery 7', 'image'),
            mkAsset('test-d-gallery-8', 'Test Delta Gallery 8', 'image'),
            mkAsset('test-d-gallery-9', 'Test Delta Gallery 9', 'image'),
            mkAsset('test-d-gallery-10', 'Test Delta Gallery 10', 'image'),
            mkAsset('test-d-gallery-11', 'Test Delta Gallery 11', 'image'),
            mkAsset('test-d-gallery-12', 'Test Delta Gallery 12', 'image'),
            mkAsset('test-d-gallery-13', 'Test Delta Gallery 13', 'image'),
            mkAsset('test-d-gallery-14', 'Test Delta Gallery 14', 'image'),
        ],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-TEST-D-V1', title: { de: 'Test Delta V1', en: 'Test Delta V1', fr: 'Test Delta V1' }, attributes: { variant: 'V1' }, price: { EUR: 120.00, USD: 132.00, GBP: 105.00 }, stock: { Hauptlager: 80 }, assets: [mkAsset('test-d-v1-1', 'Delta V1 Asset 1'), mkAsset('test-d-v1-2', 'Delta V1 Asset 2'), mkAsset('test-d-v1-3', 'Delta V1 Asset 3')], published: true },
            { itemNumber: 'LS-TEST-D-V2', title: { de: 'Test Delta V2', en: 'Test Delta V2', fr: 'Test Delta V2' }, attributes: { variant: 'V2' }, price: { EUR: 135.00, USD: 148.00, GBP: 118.00 }, stock: { Hauptlager: 60 }, assets: [mkAsset('test-d-v2-1', 'Delta V2 Asset 1'), mkAsset('test-d-v2-2', 'Delta V2 Asset 2')], published: true },
        ],
    },
    // 21: Product E — Tests facet MERGE/REMOVE modes
    {
        id: 1021, itemNumber: 'LS-TEST-E', type: 'product',
        title: { de: 'Facet-Testprodukt Epsilon', en: 'Facet Test Product Epsilon', fr: 'Produit test Facet Epsilon' },
        subtitle: { de: 'Facet-Modi testen', en: 'Testing facet modes', fr: 'Test des modes facette' },
        shortDescription: { de: 'Produkt mit vielen Facetten zum Testen von MERGE/REMOVE', en: 'Product with many facets for testing MERGE/REMOVE', fr: 'Produit avec nombreuses facettes pour tester MERGE/REMOVE' },
        description: { de: '<p>Testprodukt mit allen Material-Facetten und allen Zertifizierungs-Facetten für MERGE/REMOVE Tests.</p>', en: '<p>Test product with all material facets and all certification facets for MERGE/REMOVE tests.</p>', fr: '<p>Produit test avec toutes les facettes matériaux et toutes les facettes certification pour tests MERGE/REMOVE.</p>' },
        channels: ['web', 'b2b', 'uk-store'], published: true,
        categoryCode: 'safety-equipment', facetCodes: ['material:nitril', 'material:latex', 'material:ptfe', 'material:nylon', 'certification:ce', 'certification:iso-9001', 'certification:glp', 'certification:fda', 'application:labor', 'application:industrie', 'application:forschung'],
        assets: [mkAsset('test-e-main', 'Test Product Epsilon')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-TEST-E', title: { de: 'Test Epsilon', en: 'Test Epsilon', fr: 'Test Epsilon' }, attributes: {}, price: { EUR: 199.99, USD: 219.99, GBP: 179.99, CHF: 209.99 }, stock: { Hauptlager: 150, Aussenlager: 75 }, assets: [], published: true },
        ],
    },
    // 22: Product F — UK Store only (single channel test)
    {
        id: 1022, itemNumber: 'LS-TEST-F', type: 'product',
        title: { de: 'UK Exklusiv Testprodukt Zeta', en: 'UK Exclusive Test Product Zeta', fr: 'Produit test exclusif UK Zeta' },
        subtitle: { de: 'Nur im UK Store erhältlich', en: 'Only available in UK Store', fr: 'Disponible uniquement au UK Store' },
        shortDescription: { de: 'UK-exklusives Produkt für Einzelkanal-Tests', en: 'UK-only product for single-channel testing', fr: 'Produit exclusif UK pour tests mono-canal' },
        description: { de: '<p>Dieses Produkt ist exklusiv im UK Store Kanal mit GBP-Preisen verfügbar.</p>', en: '<p>This product is exclusive to the UK Store channel with GBP pricing only.</p>', fr: '<p>Ce produit est exclusif au canal UK Store avec des prix en GBP uniquement.</p>' },
        channels: ['uk-store'], published: true,
        categoryCode: 'scales', facetCodes: ['certification:ce', 'application:labor'],
        assets: [mkAsset('test-f-main', 'Test Product Zeta UK')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-TEST-F', title: { de: 'Test Zeta UK', en: 'Test Zeta UK', fr: 'Test Zeta UK' }, attributes: {}, price: { GBP: 149.99 }, stock: { Hauptlager: 40 }, assets: [], published: true },
        ],
    },
    // 23: Product G — B2B only (single channel test)
    {
        id: 1023, itemNumber: 'LS-TEST-G', type: 'product',
        title: { de: 'B2B Exklusiv Testprodukt Eta', en: 'B2B Exclusive Test Product Eta', fr: 'Produit test exclusif B2B Eta' },
        subtitle: { de: 'Nur im B2B Portal', en: 'Only in B2B Portal', fr: 'Uniquement dans le portail B2B' },
        shortDescription: { de: 'B2B-exklusives Produkt', en: 'B2B-exclusive product', fr: 'Produit exclusif B2B' },
        description: { de: '<p>Dieses Produkt ist nur im B2B-Kanal verfügbar.</p>', en: '<p>This product is only available in the B2B channel.</p>', fr: '<p>Ce produit est uniquement disponible dans le canal B2B.</p>' },
        channels: ['b2b'], published: true,
        categoryCode: 'centrifuges', facetCodes: ['certification:iso-9001', 'application:forschung'],
        assets: [mkAsset('test-g-main', 'Test Product Eta B2B')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-TEST-G', title: { de: 'Test Eta B2B', en: 'Test Eta B2B', fr: 'Test Eta B2B' }, attributes: {}, price: { EUR: 2499.00, USD: 2749.00, GBP: 2199.00 }, stock: { Hauptlager: 15 }, assets: [], published: true },
        ],
    },
    // 24: Product H — Web + B2B (multi-channel combination test)
    {
        id: 1024, itemNumber: 'LS-TEST-H', type: 'product',
        title: { de: 'Web+B2B Testprodukt Theta', en: 'Web+B2B Test Product Theta', fr: 'Produit test Web+B2B Theta' },
        subtitle: { de: 'In Web und B2B', en: 'In Web and B2B', fr: 'Dans Web et B2B' },
        shortDescription: { de: 'Verfügbar in Web und B2B Kanälen', en: 'Available in Web and B2B channels', fr: 'Disponible dans les canaux Web et B2B' },
        description: { de: '<p>Testprodukt für Web + B2B Kanal-Kombination.</p>', en: '<p>Test product for Web + B2B channel combination.</p>', fr: '<p>Produit test pour combinaison de canaux Web + B2B.</p>' },
        channels: ['web', 'b2b'], published: true,
        categoryCode: 'microscopes', facetCodes: ['certification:ce', 'application:labor', 'application:medizin'],
        assets: [mkAsset('test-h-main', 'Test Product Theta')],
        modifiedAt: now,
        variants: [
            { itemNumber: 'LS-TEST-H', title: { de: 'Test Theta', en: 'Test Theta', fr: 'Test Theta' }, attributes: {}, price: { EUR: 3200.00, USD: 3520.00, CHF: 3360.00 }, stock: { Hauptlager: 8 }, assets: [], published: true },
        ],
    },
];

// ── Change Feed ──────────────────────────────────────────────────────────────
const changeLog: ChangeEvent[] = [
    { timestamp: new Date(Date.now() - 3600000).toISOString(), entity: 'product', action: 'update', entityId: 1001, details: 'Price updated for ProGrip XL' },
    { timestamp: new Date(Date.now() - 7200000).toISOString(), entity: 'product', action: 'update', entityId: 1014, details: 'Variant LS-COA-001-XL discontinued' },
    { timestamp: new Date(Date.now() - 86400000).toISOString(), entity: 'product', action: 'create', entityId: 1015, details: 'New product SpinMax 8000' },
    { timestamp: new Date(Date.now() - 172800000).toISOString(), entity: 'facet', action: 'update', entityId: 'hazard-class', details: 'New hazard class GHS07 added' },
    // ERP delta sync events
    { timestamp: new Date('2026-03-01T10:00:00Z').toISOString(), entity: 'product', action: 'delete', entityId: 1026, details: 'Product LS-DEL-001 deleted in ERP' },
    { timestamp: new Date('2026-03-01T10:00:00Z').toISOString(), entity: 'product', action: 'delete', entityId: 1027, details: 'Product LS-DEL-002 EOL deletion' },
    { timestamp: new Date('2026-02-28T08:00:00Z').toISOString(), entity: 'product', action: 'create', entityId: 1025, details: 'New ISK-PRO-001 Safety Kit added' },
    { timestamp: new Date('2026-02-28T08:00:00Z').toISOString(), entity: 'customer', action: 'create', entityId: 5009, details: 'New wholesale customer Industrial Supplies GmbH' },
    { timestamp: new Date('2026-02-28T08:00:00Z').toISOString(), entity: 'customer', action: 'create', entityId: 5011, details: 'New enterprise customer GlobalLab Corporation' },
    { timestamp: new Date('2026-01-15T10:00:00Z').toISOString(), entity: 'customer', action: 'delete', entityId: 5016, details: 'Customer Legacy Supplier GmbH deactivated - insolvency' },
    { timestamp: new Date('2026-01-05T08:00:00Z').toISOString(), entity: 'facet', action: 'create', entityId: 'brand', details: 'New brand facet added for ERP import' },
];

// ── Shipping Methods ────────────────────────────────────────────────────────
const shippingMethods = [
    { code: 'standard-shipping', name: { de: 'Standardversand', en: 'Standard Shipping' }, description: { de: 'Lieferung in 3-5 Tagen', en: 'Delivery in 3-5 days' }, calculator: { code: 'default-shipping-calculator', args: { rate: 500 } }, checker: { code: 'default-shipping-eligibility-checker', args: { orderMinimum: 0 } } },
    { code: 'express-shipping', name: { de: 'Expressversand', en: 'Express Shipping' }, description: { de: 'Lieferung am nächsten Tag', en: 'Next day delivery' }, calculator: { code: 'default-shipping-calculator', args: { rate: 1500 } }, checker: { code: 'default-shipping-eligibility-checker', args: { orderMinimum: 0 } } },
    { code: 'freight-shipping', name: { de: 'Frachtversand', en: 'Freight Shipping' }, description: { de: 'Für schwere Güter', en: 'For heavy goods' }, calculator: { code: 'default-shipping-calculator', args: { rate: 3500 } }, checker: { code: 'default-shipping-eligibility-checker', args: { orderMinimum: 10000 } } },
];

// ── Payment Methods ─────────────────────────────────────────────────────────
const paymentMethods = [
    { code: 'standard-payment', name: { de: 'Standardzahlung', en: 'Standard Payment' }, description: { de: 'Kreditkarte oder Überweisung', en: 'Credit card or bank transfer' }, handler: { code: 'dummy-payment-handler', args: { automaticSettle: 'true' } } },
    { code: 'invoice-payment', name: { de: 'Rechnung', en: 'Invoice Payment' }, description: { de: 'Zahlung auf Rechnung (nur B2B)', en: 'Payment on invoice (B2B only)' }, handler: { code: 'dummy-payment-handler', args: { automaticSettle: 'false' } } },
];

// ── Tax Rates ───────────────────────────────────────────────────────────────
const taxRates = [
    { name: 'Standard Rate', rate: 19, zone: 'Europe', category: 'Standard Tax' },
    { name: 'Reduced Rate', rate: 7, zone: 'Europe', category: 'Standard Tax' },
    { name: 'Zero Rate', rate: 0, zone: 'Europe', category: 'Standard Tax' },
];

// ── Customer Groups ─────────────────────────────────────────────────────────
function deriveCustomerGroups() {
    const groupMap = new Map<string, string[]>();
    for (const c of customers) {
        for (const g of c.groups) {
            if (!groupMap.has(g)) groupMap.set(g, []);
            groupMap.get(g)!.push(c.email);
        }
    }
    return Array.from(groupMap.entries()).map(([name, customerEmails]) => ({ name, customerEmails }));
}

// ── Orders ──────────────────────────────────────────────────────────────────
/** Test orders covering all order states and scenarios */
const orders = [
    { code: 'ORD-2024-001', customerEmail: 'max.mustermann@labtech.de', state: 'PaymentSettled', shippingMethodCode: 'standard-shipping', orderPlacedAt: '2024-02-15T10:30:00Z', lines: [{ sku: 'LS-GLV-001-M', quantity: 10, unitPrice: 2990 }, { sku: 'LS-GOG-001', quantity: 5, unitPrice: 2290 }], shippingAddress: { fullName: 'Max Mustermann', streetLine1: 'Laborstraße 42', city: 'Berlin', postalCode: '10115', countryCode: 'DE' }, billingAddress: { fullName: 'Max Mustermann', company: 'LabTech GmbH', streetLine1: 'Laborstraße 42', city: 'Berlin', postalCode: '10115', countryCode: 'DE' } },
    { code: 'ORD-2024-002', customerEmail: 'sarah.schmidt@uniklinik.de', state: 'Delivered', shippingMethodCode: 'express-shipping', orderPlacedAt: '2024-03-01T14:00:00Z', lines: [{ sku: 'LS-PIP-001-100', quantity: 3, unitPrice: 19900 }, { sku: 'LS-TIP-001-FIL', quantity: 20, unitPrice: 1890 }], shippingAddress: { fullName: 'Sarah Schmidt', company: 'Universitätsklinik München', streetLine1: 'Klinikweg 7', city: 'München', postalCode: '80333', countryCode: 'DE' }, billingAddress: { fullName: 'Sarah Schmidt', company: 'Universitätsklinik München', streetLine1: 'Rechnungsabteilung, Postfach 1234', city: 'München', postalCode: '80331', countryCode: 'DE' } },
    { code: 'ORD-2024-003', customerEmail: 'john.doe@research-inc.com', state: 'PaymentSettled', shippingMethodCode: 'freight-shipping', orderPlacedAt: '2024-04-10T09:15:00Z', lines: [{ sku: 'LS-BAL-001', quantity: 1, unitPrice: 245000 }, { sku: 'LS-FIL-001-02', quantity: 10, unitPrice: 7800 }], shippingAddress: { fullName: 'John Doe', company: 'Research Inc.', streetLine1: '123 Science Blvd', streetLine2: 'Suite 400', city: 'Boston', postalCode: '02101', countryCode: 'US', province: 'MA' }, billingAddress: { fullName: 'John Doe', company: 'Research Inc.', streetLine1: '123 Science Blvd', streetLine2: 'Suite 400', city: 'Boston', postalCode: '02101', countryCode: 'US', province: 'MA' } },
    { code: 'ORD-2024-004', customerEmail: 'lisa.weber@privat.de', state: 'ArrangingPayment', shippingMethodCode: 'standard-shipping', orderPlacedAt: '2024-05-20T16:45:00Z', lines: [{ sku: 'LS-CHM-001', quantity: 2, unitPrice: 3250 }], shippingAddress: { fullName: 'Lisa Weber', streetLine1: 'Hauptstraße 15', city: 'Hamburg', postalCode: '20095', countryCode: 'DE' }, billingAddress: { fullName: 'Lisa Weber', streetLine1: 'Hauptstraße 15', city: 'Hamburg', postalCode: '20095', countryCode: 'DE' } },
    { code: 'ORD-2025-001', customerEmail: 'max.mustermann@labtech.de', state: 'PaymentSettled', shippingMethodCode: 'standard-shipping', orderPlacedAt: '2025-01-10T08:00:00Z', lines: [{ sku: 'LS-COA-001-M', quantity: 20, unitPrice: 3990 }, { sku: 'LS-TOW-001-S', quantity: 50, unitPrice: 1490 }], shippingAddress: { fullName: 'Max Mustermann', company: 'LabTech GmbH', streetLine1: 'Laborstraße 42', city: 'Berlin', postalCode: '10115', countryCode: 'DE' }, billingAddress: { fullName: 'Max Mustermann', company: 'LabTech GmbH', streetLine1: 'Laborstraße 42', city: 'Berlin', postalCode: '10115', countryCode: 'DE' } },
    // Additional orders testing various states
    { code: 'ORD-2025-002', customerEmail: 'anna.becker@pharma-logistics.de', state: 'AddingItems', shippingMethodCode: 'standard-shipping', orderPlacedAt: '2025-02-01T09:00:00Z', lines: [{ sku: 'LS-FIL-001-02', quantity: 5, unitPrice: 7800 }], shippingAddress: { fullName: 'Anna Becker', company: 'Pharma Logistics AG', streetLine1: 'Industriestraße 88', city: 'Köln', postalCode: '50667', countryCode: 'DE' }, billingAddress: { fullName: 'Anna Becker', company: 'Pharma Logistics AG', streetLine1: 'Finanzabteilung, Postfach 5500', city: 'Köln', postalCode: '50668', countryCode: 'DE' } },
    { code: 'ORD-2025-003', customerEmail: 'juergen.boehm@tu-dresden.de', state: 'PaymentAuthorized', shippingMethodCode: 'express-shipping', orderPlacedAt: '2025-02-10T14:30:00Z', lines: [{ sku: 'LS-PIP-001-10', quantity: 2, unitPrice: 18900 }, { sku: 'LS-PIP-001-100', quantity: 2, unitPrice: 19900 }], shippingAddress: { fullName: 'Jürgen Böhm', company: 'TU Dresden', streetLine1: 'Helmholtzstraße 10', city: 'Dresden', postalCode: '01069', countryCode: 'DE' }, billingAddress: { fullName: 'Jürgen Böhm', company: 'TU Dresden', streetLine1: 'Helmholtzstraße 10', city: 'Dresden', postalCode: '01069', countryCode: 'DE' } },
    { code: 'ORD-2025-004', customerEmail: 'sarah.schmidt@uniklinik.de', state: 'PartiallyShipped', shippingMethodCode: 'freight-shipping', orderPlacedAt: '2025-02-12T11:00:00Z', lines: [{ sku: 'LS-BAL-002', quantity: 2, unitPrice: 489000 }, { sku: 'LS-CEN-001', quantity: 1, unitPrice: 675000 }], shippingAddress: { fullName: 'Sarah Schmidt', company: 'Universitätsklinik München', streetLine1: 'Klinikweg 7', city: 'München', postalCode: '80333', countryCode: 'DE' }, billingAddress: { fullName: 'Sarah Schmidt', company: 'Universitätsklinik München', streetLine1: 'Rechnungsabteilung, Postfach 1234', city: 'München', postalCode: '80331', countryCode: 'DE' } },
    { code: 'ORD-2025-005', customerEmail: 'max.mustermann@labtech.de', state: 'Shipped', shippingMethodCode: 'standard-shipping', orderPlacedAt: '2025-02-15T08:30:00Z', lines: [{ sku: 'LS-GLV-001-L', quantity: 15, unitPrice: 2990 }, { sku: 'LS-GLV-001-XL', quantity: 10, unitPrice: 3190 }], shippingAddress: { fullName: 'Max Mustermann', company: 'LabTech GmbH', streetLine1: 'Laborstraße 42', city: 'Berlin', postalCode: '10115', countryCode: 'DE' }, billingAddress: { fullName: 'Max Mustermann', company: 'LabTech GmbH', streetLine1: 'Laborstraße 42', city: 'Berlin', postalCode: '10115', countryCode: 'DE' } },
    { code: 'ORD-2025-006', customerEmail: 'francois.mueller-levy@gmail.com', state: 'PartiallyDelivered', shippingMethodCode: 'express-shipping', orderPlacedAt: '2025-02-18T10:00:00Z', lines: [{ sku: 'LS-TEST-A', quantity: 3, unitPrice: 9999 }, { sku: 'LS-TEST-B', quantity: 2, unitPrice: 4999 }], shippingAddress: { fullName: 'François Müller-Lévy', streetLine1: '14 Rue de la Paix', city: 'Strasbourg', postalCode: '67000', countryCode: 'FR' }, billingAddress: { fullName: 'François Müller-Lévy', streetLine1: '14 Rue de la Paix', city: 'Strasbourg', postalCode: '67000', countryCode: 'FR' } },
    { code: 'ORD-2025-007', customerEmail: 'lisa.weber@privat.de', state: 'Cancelled', shippingMethodCode: 'standard-shipping', orderPlacedAt: '2025-02-20T13:00:00Z', lines: [{ sku: 'LS-CHM-002', quantity: 4, unitPrice: 2890 }], shippingAddress: { fullName: 'Lisa Weber', streetLine1: 'Hauptstraße 15', city: 'Hamburg', postalCode: '20095', countryCode: 'DE' }, billingAddress: { fullName: 'Lisa Weber', streetLine1: 'Hauptstraße 15', city: 'Hamburg', postalCode: '20095', countryCode: 'DE' } },
    // Backdated order for testing orderPlacedAt handling
    { code: 'ORD-2023-999', customerEmail: 'max.mustermann@labtech.de', state: 'Delivered', shippingMethodCode: 'standard-shipping', orderPlacedAt: '2023-12-25T00:00:00Z', lines: [{ sku: 'LS-CON-001', quantity: 5, unitPrice: 14550 }], shippingAddress: { fullName: 'Max Mustermann', company: 'LabTech GmbH', streetLine1: 'Laborstraße 42', city: 'Berlin', postalCode: '10115', countryCode: 'DE' }, billingAddress: { fullName: 'Max Mustermann', company: 'LabTech GmbH', streetLine1: 'Laborstraße 42', city: 'Berlin', postalCode: '10115', countryCode: 'DE' } },
    // ── ERP ENTERPRISE ORDER SCENARIOS ──────────────────────────────────────
    // Complex multi-line order (5 lines)
    { code: 'ERP-2026-001', customerEmail: 'procurement@industrial-supplies.de', state: 'Delivered', shippingMethodCode: 'freight-shipping', orderPlacedAt: '2026-01-15T10:00:00Z', discountCode: 'BULK20', lines: [{ sku: 'ISK-PRO-M-YEL-COT', quantity: 50, unitPrice: 9490 }, { sku: 'ISK-PRO-L-ORG-COT', quantity: 30, unitPrice: 9790 }, { sku: 'ISK-PRO-XL-RED-COT', quantity: 20, unitPrice: 10290 }, { sku: 'LS-GLV-001-L', quantity: 100, unitPrice: 2990 }, { sku: 'LS-GOG-001', quantity: 50, unitPrice: 2290 }], customFields: { trackingNumber: 'DHL-DE-9876543210', purchaseOrderRef: 'PO-IS-2026-0042', importSource: 'erp-pimcore' }, shippingAddress: { fullName: 'Klaus Hoffmann', company: 'Industrial Supplies GmbH', streetLine1: 'Gewerbepark 12', city: 'Berlin', postalCode: '12355', countryCode: 'DE' }, billingAddress: { fullName: 'Klaus Hoffmann', company: 'Industrial Supplies GmbH', streetLine1: 'Gewerbepark 12', city: 'Berlin', postalCode: '12355', countryCode: 'DE' } },
    // B2B order with purchase order reference (enterprise)
    { code: 'ERP-2026-002', customerEmail: 'supply.chain@globallab-corp.com', state: 'Shipped', shippingMethodCode: 'express-shipping', orderPlacedAt: '2026-01-20T14:30:00Z', lines: [{ sku: 'LS-BAL-001', quantity: 3, unitPrice: 245000 }, { sku: 'LS-BAL-002', quantity: 2, unitPrice: 489000 }, { sku: 'LS-CEN-001', quantity: 1, unitPrice: 675000 }], customFields: { trackingNumber: 'UPS-1Z999AA10123456784', purchaseOrderRef: 'GLC-PO-2026-0189', importSource: 'erp-pimcore' }, shippingAddress: { fullName: 'Patricia O\'Brien', company: 'GlobalLab Corporation', streetLine1: '500 Innovation Drive', streetLine2: 'Building C', city: 'Cambridge', postalCode: '02139', countryCode: 'US', province: 'MA' }, billingAddress: { fullName: 'Patricia O\'Brien', company: 'GlobalLab Corporation', streetLine1: '500 Innovation Drive', streetLine2: 'Building C', city: 'Cambridge', postalCode: '02139', countryCode: 'US', province: 'MA' } },
    // Order with coupon code NEWYEAR2026
    { code: 'ERP-2026-003', customerEmail: 'einkauf@chemikal-wholesale.de', state: 'PaymentSettled', shippingMethodCode: 'standard-shipping', orderPlacedAt: '2026-01-05T08:00:00Z', discountCode: 'NEWYEAR2026', lines: [{ sku: 'LS-FIL-001-02', quantity: 20, unitPrice: 7800 }, { sku: 'LS-FIL-001-05', quantity: 15, unitPrice: 7200 }, { sku: 'LS-FIL-001-10', quantity: 10, unitPrice: 6800 }], customFields: { purchaseOrderRef: 'CW-2026-NY-001', importSource: 'erp-pimcore' }, shippingAddress: { fullName: 'Monika Richter', company: 'Chemikal Wholesale AG', streetLine1: 'Großhandelsstraße 55', city: 'München', postalCode: '80637', countryCode: 'DE' }, billingAddress: { fullName: 'Monika Richter', company: 'Chemikal Wholesale AG', streetLine1: 'Großhandelsstraße 55', city: 'München', postalCode: '80637', countryCode: 'DE' } },
    // UK B2B order (GBP)
    { code: 'ERP-2026-004', customerEmail: 'orders@lab-enterprise.co.uk', state: 'Delivered', shippingMethodCode: 'express-shipping', orderPlacedAt: '2026-02-01T11:00:00Z', lines: [{ sku: 'ISK-PRO-L-ORG-KEV', quantity: 25, unitPrice: 13590 }, { sku: 'ISK-PRO-XL-RED-KEV', quantity: 15, unitPrice: 14490 }], customFields: { trackingNumber: 'FEDEX-770748597011', purchaseOrderRef: 'LE-UK-2026-PO-0077', importSource: 'erp-pimcore' }, shippingAddress: { fullName: 'James Harrison', company: 'Lab Enterprise Ltd', streetLine1: '42 Science Park', city: 'London', postalCode: 'SW1A 2AA', countryCode: 'GB' }, billingAddress: { fullName: 'James Harrison', company: 'Lab Enterprise Ltd', streetLine1: '42 Science Park', city: 'London', postalCode: 'SW1A 2AA', countryCode: 'GB' } },
    // State: Placed → PaymentSettled → Fulfilling → Shipped → Delivered transition test
    { code: 'ERP-2026-005', customerEmail: 'beschaffung@dax-chemicals.de', state: 'Delivered', shippingMethodCode: 'freight-shipping', orderPlacedAt: '2025-12-10T09:00:00Z', lines: [{ sku: 'LS-CON-001', quantity: 20, unitPrice: 14550 }, { sku: 'LS-CON-002', quantity: 10, unitPrice: 19800 }, { sku: 'LS-CHM-001', quantity: 40, unitPrice: 3250 }, { sku: 'LS-CHM-002', quantity: 30, unitPrice: 2890 }, { sku: 'LS-FIL-001-02', quantity: 15, unitPrice: 7800 }, { sku: 'LS-BAL-001', quantity: 1, unitPrice: 245000 }], customFields: { trackingNumber: 'TNT-DE-548920374861', purchaseOrderRef: 'DAX-2025-Q4-0312', importSource: 'erp-pimcore' }, shippingAddress: { fullName: 'Ingrid Zimmermann', company: 'DAX Chemicals AG', streetLine1: 'Mainzer Landstraße 200', city: 'Frankfurt', postalCode: '60327', countryCode: 'DE' }, billingAddress: { fullName: 'Ingrid Zimmermann', company: 'DAX Chemicals AG', streetLine1: 'Rechtsabteilung, Theodor-Heuss-Allee 2', city: 'Frankfurt', postalCode: '60486', countryCode: 'DE' } },
];

// ── Deletions ───────────────────────────────────────────────────────────────
/**
 * Test deletions covering all 13 entity types supported by deletion-handler.ts:
 * Product, ProductVariant, Collection, Facet, FacetValue, Promotion, ShippingMethod,
 * PaymentMethod, Channel, TaxRate, Asset, StockLocation, CustomerGroup
 */
const deletions = [
    // ProductVariant (matchBy: sku)
    { entityType: 'variant', identifier: 'LS-GLV-001-S', matchBy: 'sku', reason: 'Discontinued size S' },
    { entityType: 'variant', identifier: 'LS-COA-001-XL', matchBy: 'sku', reason: 'Discontinued size XL' },
    // Product (matchBy: slug)
    { entityType: 'product', identifier: 'ls-mic-001', matchBy: 'slug', reason: 'Product unpublished - remove from catalog' },
    { entityType: 'product', identifier: 'universal-test-product-alpha', matchBy: 'slug', reason: 'Test product - remove after testing' },
    // Collection (matchBy: slug)
    { entityType: 'collection', identifier: 'winter-2024-collection', matchBy: 'slug', reason: 'Seasonal collection ended' },
    // Facet (matchBy: code)
    { entityType: 'facet', identifier: 'obsolete-facet', matchBy: 'code', reason: 'Facet category no longer used' },
    // FacetValue (matchBy: code)
    { entityType: 'facet-value', identifier: 'ghs07', matchBy: 'code', reason: 'Hazard class reclassified' },
    { entityType: 'facet-value', identifier: 'old-certification', matchBy: 'code', reason: 'Certification standard replaced' },
    // Promotion (matchBy: code)
    { entityType: 'promotion', identifier: 'FILTER-SALE', matchBy: 'code', reason: 'Expired promotion - disabled and removed' },
    { entityType: 'promotion', identifier: 'OLD-DISCOUNT-2023', matchBy: 'code', reason: 'Old promotion cleanup' },
    // ShippingMethod (matchBy: code)
    { entityType: 'shipping-method', identifier: 'legacy-shipping', matchBy: 'code', reason: 'Replaced by modern shipping providers' },
    // PaymentMethod (matchBy: code)
    { entityType: 'payment-method', identifier: 'deprecated-payment', matchBy: 'code', reason: 'Payment provider discontinued' },
    // Channel (matchBy: code)
    { entityType: 'channel', identifier: 'old-marketplace', matchBy: 'code', reason: 'Marketplace integration ended' },
    // TaxRate (matchBy: name)
    { entityType: 'tax-rate', identifier: 'Obsolete Tax Rate', matchBy: 'name', reason: 'Tax law changed - rate no longer valid' },
    { entityType: 'tax-rate', identifier: 'Old Rate', matchBy: 'name', reason: 'Consolidated into standard rates' },
    // Asset (matchBy: source URL)
    { entityType: 'asset', identifier: 'https://old-cdn.example.com/assets/image-123.jpg', matchBy: 'source', reason: 'Migrated to new CDN' },
    { entityType: 'asset', identifier: 'https://legacy-storage.example.com/old-product.png', matchBy: 'source', reason: 'Asset no longer used' },
    // StockLocation (matchBy: name)
    { entityType: 'stock-location', identifier: 'Old Warehouse Berlin', matchBy: 'name', reason: 'Warehouse closed' },
    { entityType: 'stock-location', identifier: 'Temporary Storage 2023', matchBy: 'name', reason: 'Temporary location closed after project completion' },
    // CustomerGroup (matchBy: name)
    { entityType: 'customer-group', identifier: 'Legacy VIP', matchBy: 'name', reason: 'Replaced by new Premium tier system' },
    { entityType: 'customer-group', identifier: 'Trial Users 2023', matchBy: 'name', reason: 'Trial program ended' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function filterByChannel(items: Product[], channel?: string): Product[] {
    if (!channel) return items;
    const allowed = channel.split(',').map(c => c.trim());
    return items.filter(p => p.channels.some(c => allowed.includes(c)));
}

function buildListingItem(p: Product, locale: string, withTranslations: boolean) {
    const item: Record<string, unknown> = {
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
    if (p.deletedAt) {
        item.deletedAt = p.deletedAt;
    }
    if (withTranslations) {
        item.translations = buildTranslations({ name: p.title });
    }
    return item;
}

function buildDetailResponse(p: Product, locale: string, withTranslations: boolean) {
    const activeVariants = p.variants.filter(v => !v.deletedAt);
    const productObj: Record<string, unknown> = {
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
    };
    // Include ERP custom fields if present
    if (p.customFields) {
        productObj.customFields = p.customFields;
    }
    // Include deletedAt for ERP delete sync
    if (p.deletedAt) {
        productObj.deletedAt = p.deletedAt;
    }
    if (withTranslations) {
        productObj.translations = buildTranslations({ name: p.title, slug: slugifyTranslations(p.title), description: p.description });
    }
    return {
        product: productObj,
        assets: p.assets.map(a => ({ id: a.id, url: a.url, alt: a.alt, type: a.type })),
        variants: activeVariants.map(v => {
            const variantObj: Record<string, unknown> = {
                itemNumber: v.itemNumber,
                title: t(v.title, locale),
                attributes: v.attributes,
                price: v.price,
                stock: v.stock,
                assets: v.assets,
                published: v.published,
            };
            if (withTranslations) {
                variantObj.translations = buildTranslations({ name: v.title });
            }
            return variantObj;
        }),
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
    const withTranslations = wantTranslations(req);
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
        products: items.map(p => buildListingItem(p, locale, withTranslations)),
        pagination: { page, limit, total, totalPages },
    });
});

app.get('/api/products/:id', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    const withTranslations = wantTranslations(req);
    const p = products.find(p => String(p.id) === req.params.id || p.itemNumber === req.params.id);
    if (!p) return res.status(404).json({ error: 'Product not found' });
    console.log(`[PIM] GET /api/products/${req.params.id} -> ${p.itemNumber}`);
    res.json(buildDetailResponse(p, locale, withTranslations));
});

app.get('/api/facets', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    const withTranslations = wantTranslations(req);
    console.log(`[PIM] GET /api/facets -> ${facets.length} facets`);
    res.json({
        facets: facets.map(f => {
            const facetObj: Record<string, unknown> = {
                code: f.code,
                name: t(f.name, locale),
                values: f.values.map(v => {
                    const valObj: Record<string, unknown> = { code: v.code, name: t(v.name, locale) };
                    if (withTranslations) {
                        valObj.translations = buildTranslations({ name: v.name });
                    }
                    return valObj;
                }),
            };
            if (withTranslations) {
                facetObj.translations = buildTranslations({ name: f.name });
            }
            return facetObj;
        }),
    });
});

app.get('/api/categories', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    const withTranslations = wantTranslations(req);
    console.log(`[PIM] GET /api/categories -> ${categories.length} categories`);
    res.json({
        categories: categories.map(c => {
            const catObj: Record<string, unknown> = {
                code: c.code,
                name: t(c.name, locale),
                description: t(c.description, locale),
                parentCode: c.parentCode,
                sortOrder: c.sortOrder,
            };
            if (withTranslations) {
                // Use the category code as slug source — build a Record<string, string> mapping from locales
                const slugByLocale: Record<string, string> = {};
                for (const loc of Object.keys(c.name)) slugByLocale[loc] = c.code;
                catObj.translations = buildTranslations({ name: c.name, description: c.description, slug: slugByLocale });
            }
            return catObj;
        }),
    });
});

app.get('/api/promotions', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    const withTranslations = wantTranslations(req);
    console.log(`[PIM] GET /api/promotions -> ${promotions.length} promotions`);
    res.json({
        promotions: promotions.map(p => {
            const promoObj: Record<string, unknown> = {
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
            };
            if (withTranslations) {
                promoObj.translations = buildTranslations({ name: p.name });
            }
            return promoObj;
        }),
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
    // Return events with normalized `operation` field for ERP delta sync pipelines
    res.json({
        changes: events.map(e => ({
            ...e,
            operation: e.action === 'delete' ? 'DELETE' : 'UPSERT',
        })),
        nextSince: new Date().toISOString(),
    });
});

app.get('/api/customers', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    const withTranslations = wantTranslations(req);
    const activeOnly = req.query.activeOnly !== 'false';
    const group = req.query.group as string | undefined;

    let filtered = activeOnly ? customers.filter(c => c.active) : customers;
    if (group) {
        filtered = filtered.filter(c => c.groups.includes(group));
    }

    console.log(`[PIM] GET /api/customers -> ${filtered.length} customers (active=${activeOnly}, group=${group ?? 'all'})`);
    res.json({
        customers: filtered.map(c => {
            const custObj: Record<string, unknown> = {
                id: c.id,
                email: c.email,
                firstName: t(c.firstName, locale),
                lastName: t(c.lastName, locale),
                phone: c.phone,
                company: c.company,
                vatNumber: c.vatNumber,
                groups: c.groups,
                addresses: c.addresses,
                active: c.active,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt || c.createdAt,
            };
            if (c.deletedAt) custObj.deletedAt = c.deletedAt;
            if (withTranslations) {
                custObj.translations = buildTranslations({ firstName: c.firstName, lastName: c.lastName });
            }
            return custObj;
        }),
    });
});

app.get('/api/customers/:id', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    const withTranslations = wantTranslations(req);
    const c = customers.find(c => String(c.id) === req.params.id || c.email === req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    console.log(`[PIM] GET /api/customers/${req.params.id} -> ${c.email}`);
    const custObj: Record<string, unknown> = {
        id: c.id,
        email: c.email,
        firstName: t(c.firstName, locale),
        lastName: t(c.lastName, locale),
        phone: c.phone,
        company: c.company,
        vatNumber: c.vatNumber,
        groups: c.groups,
        addresses: c.addresses,
        active: c.active,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt || c.createdAt,
    };
    if (c.deletedAt) custObj.deletedAt = c.deletedAt;
    if (withTranslations) {
        custObj.translations = buildTranslations({ firstName: c.firstName, lastName: c.lastName });
    }
    res.json(custObj);
});

app.get('/api/shipping-methods', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    const withTranslations = wantTranslations(req);
    console.log(`[PIM] GET /api/shipping-methods -> ${shippingMethods.length} shipping methods`);
    res.json({
        shippingMethods: shippingMethods.map(sm => {
            const obj: Record<string, unknown> = {
                code: sm.code,
                name: t(sm.name, locale),
                description: t(sm.description, locale),
                calculator: sm.calculator,
                checker: sm.checker,
            };
            if (withTranslations) {
                obj.translations = buildTranslations({ name: sm.name, description: sm.description });
            }
            return obj;
        }),
    });
});

app.get('/api/payment-methods', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const locale = lang(req);
    const withTranslations = wantTranslations(req);
    console.log(`[PIM] GET /api/payment-methods -> ${paymentMethods.length} payment methods`);
    res.json({
        paymentMethods: paymentMethods.map(pm => {
            const obj: Record<string, unknown> = {
                code: pm.code,
                name: t(pm.name, locale),
                description: t(pm.description, locale),
                handler: pm.handler,
            };
            if (withTranslations) {
                obj.translations = buildTranslations({ name: pm.name, description: pm.description });
            }
            return obj;
        }),
    });
});

app.get('/api/tax-rates', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    console.log(`[PIM] GET /api/tax-rates -> ${taxRates.length} tax rates`);
    res.json({ taxRates });
});

app.get('/api/customer-groups', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const groups = deriveCustomerGroups();
    console.log(`[PIM] GET /api/customer-groups -> ${groups.length} groups`);
    res.json({ customerGroups: groups });
});

app.get('/api/orders', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    console.log(`[PIM] GET /api/orders -> ${orders.length} orders`);
    res.json({ orders });
});

app.get('/api/deletions', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    console.log(`[PIM] GET /api/deletions -> ${deletions.length} deletions`);
    res.json({ deletions });
});

app.get('/api/assets', (req, res) => {
    if (!authenticate(req)) return res.status(401).json({ error: 'Unauthorized' });
    const assets = [
        { id: 1, filename: 'product-hero.jpg', name: 'Product Hero Image', url: assetUrl('product-hero'), path: '/images/products/', type: 'image', mimeType: 'image/jpeg', fileSize: 245000 },
        { id: 2, filename: 'category-banner.png', name: 'Category Banner', url: assetUrl('category-banner'), path: '/images/categories/', type: 'image', mimeType: 'image/png', fileSize: 180000 },
        { id: 3, filename: 'product-specs.pdf', name: 'Product Specifications', url: assetUrl('product-specs'), path: '/documents/', type: 'document', mimeType: 'application/pdf', fileSize: 520000 },
        { id: 4, filename: 'safety-glove-detail.jpg', name: 'Safety Glove Detail', url: assetUrl('safety-glove-detail'), path: '/images/products/', type: 'image', mimeType: 'image/jpeg', fileSize: 312000 },
        { id: 5, filename: 'lab-equipment-overview.png', name: 'Lab Equipment Overview', url: assetUrl('lab-equipment-overview'), path: '/images/categories/', type: 'image', mimeType: 'image/png', fileSize: 198000 },
    ];
    console.log(`[PIM] GET /api/assets -> ${assets.length} assets`);
    res.json({ assets });
});

app.post('/api/webhook/notify', (req, res) => {
    console.log(`[PIM] POST /api/webhook/notify -> ${JSON.stringify(req.body)}`);
    res.json({ received: true, timestamp: new Date().toISOString() });
});

app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        products: products.filter(p => !p.deletedAt).length,
        productsDeleted: products.filter(p => p.deletedAt).length,
        productsTotal: products.length,
        facets: facets.length,
        categories: categories.length,
        customers: customers.length,
        orders: orders.length,
        shippingMethods: shippingMethods.length,
        paymentMethods: paymentMethods.length,
        taxRates: taxRates.length,
        customerGroups: deriveCustomerGroups().length,
        deletions: deletions.length,
    });
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = MOCK_PORTS.PIMCORE;
app.listen(PORT, () => {
    const variantCount = products.reduce((sum, p) => sum + p.variants.filter(v => !v.deletedAt).length, 0);
    const deletedCount = products.reduce((sum, p) => sum + p.variants.filter(v => v.deletedAt).length, 0);
    const groups = deriveCustomerGroups();
    console.log(`\nMock PIM API running on http://localhost:${PORT}`);
    console.log(`  Products: ${products.length} (${products.filter(p => p.published).length} published)`);
    console.log(`  Variants: ${variantCount} active, ${deletedCount} deleted`);
    console.log(`  Facets: ${facets.length}, Categories: ${categories.length}, Promotions: ${promotions.length}`);
    console.log(`  Customers: ${customers.length} (${customers.filter(c => c.active).length} active)`);
    console.log(`  Orders: ${orders.length}, Shipping: ${shippingMethods.length}, Payment: ${paymentMethods.length}`);
    console.log(`  Tax Rates: ${taxRates.length}, Customer Groups: ${groups.length}, Deletions: ${deletions.length}`);
    console.log(`  Channels: ${channels.map(c => c.code).join(', ')}`);
    console.log(`  API Key: ${API_KEY}\n`);
});
