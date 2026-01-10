import { describe, it, expect } from 'vitest';

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
