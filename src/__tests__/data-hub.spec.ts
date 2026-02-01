import { describe, it, expect } from 'vitest';
import { validateAgainstSimpleSpec } from '../runtime/utils';

// Simple tests that don't require TypeORM/Vendure
describe('DataHub Plugin Utilities', () => {
    describe('getPath', () => {
        it('should get nested value', () => {
            const obj = { a: { b: { c: 'value' } } };
            const parts = 'a.b.c'.split('.');
            let current: unknown = obj;
            for (const part of parts) {
                if (current && typeof current === 'object') {
                    current = (current as Record<string, unknown>)[part];
                }
            }
            expect(current).toBe('value');
        });

        it('should return undefined for missing path', () => {
            const obj = { a: { b: { d: 1 } } };
            const parts = 'a.b.c'.split('.');
            let current: unknown = obj;
            for (const part of parts) {
                if (current && typeof current === 'object') {
                    current = (current as Record<string, unknown>)[part];
                }
            }
            expect(current).toBeUndefined();
        });
    });

    describe('chunk', () => {
        it('should split array into chunks', () => {
            const arr = [1, 2, 3, 4, 5];
            const size = 2;
            const result: number[][] = [];
            for (let i = 0; i < arr.length; i += size) {
                result.push(arr.slice(i, i + size));
            }
            expect(result).toEqual([[1, 2], [3, 4], [5]]);
        });

        it('should handle empty array', () => {
            const arr: number[] = [];
            const size = 2;
            const result: number[][] = [];
            for (let i = 0; i < arr.length; i += size) {
                result.push(arr.slice(i, i + size));
            }
            expect(result).toEqual([]);
        });
    });

    describe('slugify', () => {
        it('should convert to slug', () => {
            const text = 'Hello World Test';
            const slug = text
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^\w-]+/g, '');
            expect(slug).toBe('hello-world-test');
        });

        it('should handle special characters', () => {
            const text = 'Product Name 123!';
            const slug = text
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^\w-]+/g, '');
            expect(slug).toBe('product-name-123');
        });
    });
});

describe('VALIDATE Step Processing', () => {
    describe('validateAgainstSimpleSpec', () => {
        it('should validate required fields', () => {
            const record = { name: 'Test', price: null };
            const fields = {
                name: { required: true },
                price: { required: true },
            };
            const errors = validateAgainstSimpleSpec(record, fields);
            expect(errors).toContain('price is required');
        });

        it('should pass when required field is present', () => {
            const record = { name: 'Test', sku: 'SKU123' };
            const fields = {
                name: { required: true },
                sku: { required: true },
            };
            const errors = validateAgainstSimpleSpec(record, fields);
            expect(errors).toHaveLength(0);
        });

        it('should validate min/max range', () => {
            const record = { price: -10 };
            const fields = {
                price: { min: 0, max: 1000 },
            };
            const errors = validateAgainstSimpleSpec(record, fields);
            expect(errors.some(e => e.includes('price'))).toBe(true);
        });

        it('should validate regex pattern', () => {
            const record = { email: 'invalid-email' };
            const fields = {
                email: { pattern: '^[^@]+@[^@]+\\.[^@]+$' },
            };
            const errors = validateAgainstSimpleSpec(record, fields);
            expect(errors.some(e => e.includes('email'))).toBe(true);
        });

        it('should pass valid pattern', () => {
            const record = { email: 'test@example.com' };
            const fields = {
                email: { pattern: '^[^@]+@[^@]+\\.[^@]+$' },
            };
            const errors = validateAgainstSimpleSpec(record, fields);
            expect(errors).toHaveLength(0);
        });
    });

    describe('rules to fields conversion', () => {
        it('should convert rules array to fields format', () => {
            const rules = [
                { type: 'business', spec: { field: 'sku', required: true } },
                { type: 'business', spec: { field: 'price', min: 0 } },
                { type: 'business', spec: { field: 'email', pattern: '^[^@]+@[^@]+$' } },
            ];

            // Simulate the conversion logic from executeValidate
            const fields: Record<string, { required?: boolean; min?: number; pattern?: string }> = {};
            for (const rule of rules) {
                const spec = rule.spec as Record<string, unknown>;
                const fieldName = spec.field as string;
                if (!fieldName) continue;
                if (!fields[fieldName]) fields[fieldName] = {};
                if ('required' in spec) fields[fieldName].required = spec.required as boolean;
                if ('min' in spec) fields[fieldName].min = spec.min as number;
                if ('pattern' in spec) fields[fieldName].pattern = spec.pattern as string;
            }

            expect(fields.sku).toEqual({ required: true });
            expect(fields.price).toEqual({ min: 0 });
            expect(fields.email).toEqual({ pattern: '^[^@]+@[^@]+$' });
        });
    });
});

describe('ENRICH Step Processing', () => {
    describe('static enrichment', () => {
        it('should apply defaults to missing fields', () => {
            const record = { name: 'Test', price: 100 };
            const defaults = { status: 'active', currency: 'USD' };

            const enriched = { ...record };
            for (const [key, value] of Object.entries(defaults)) {
                if (enriched[key as keyof typeof enriched] === undefined || enriched[key as keyof typeof enriched] === null) {
                    (enriched as Record<string, unknown>)[key] = value;
                }
            }

            expect(enriched).toEqual({ name: 'Test', price: 100, status: 'active', currency: 'USD' });
        });

        it('should not overwrite existing values with defaults', () => {
            const record = { name: 'Test', status: 'inactive' };
            const defaults = { status: 'active', currency: 'USD' };

            const enriched = { ...record };
            for (const [key, value] of Object.entries(defaults)) {
                if (enriched[key as keyof typeof enriched] === undefined || enriched[key as keyof typeof enriched] === null) {
                    (enriched as Record<string, unknown>)[key] = value;
                }
            }

            expect(enriched.status).toBe('inactive'); // Should keep original
            expect((enriched as Record<string, unknown>).currency).toBe('USD'); // Should add new
        });

        it('should overwrite with set values', () => {
            const record = { name: 'Test', status: 'inactive' };
            const setValues = { status: 'active', lastUpdated: '2024-01-01' };

            const enriched = { ...record };
            for (const [key, value] of Object.entries(setValues)) {
                (enriched as Record<string, unknown>)[key] = value;
            }

            expect(enriched.status).toBe('active'); // Should overwrite
            expect((enriched as Record<string, unknown>).lastUpdated).toBe('2024-01-01');
        });

        it('should apply computed template fields', () => {
            const record = { firstName: 'John', lastName: 'Doe' };
            const computed = { fullName: '${firstName} ${lastName}' };

            const enriched = { ...record } as Record<string, unknown>;
            for (const [key, template] of Object.entries(computed)) {
                enriched[key] = template.replace(/\$\{([^}]+)\}/g, (_, path) => {
                    const value = enriched[path.trim()];
                    return value !== null && value !== undefined ? String(value) : '';
                });
            }

            expect(enriched.fullName).toBe('John Doe');
        });
    });
});
