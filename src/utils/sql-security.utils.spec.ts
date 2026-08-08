import { describe, expect, it } from 'vitest';
import {
    escapeSqlIdentifier,
    escapeSqlTableIdentifier,
} from './sql-security.utils';

describe('SQL identifier escaping', () => {
    it('uses ANSI identifier quotes by default', () => {
        expect(escapeSqlIdentifier('updated_at')).toBe('"updated_at"');
        expect(escapeSqlTableIdentifier('catalog.products')).toBe('"catalog"."products"');
    });

    it('uses backticks for MySQL identifiers', () => {
        expect(escapeSqlIdentifier('updated_at', '`')).toBe('`updated_at`');
        expect(escapeSqlTableIdentifier('catalog.products', '`')).toBe('`catalog`.`products`');
    });

    it('rejects unsafe identifiers before quoting', () => {
        expect(() => escapeSqlIdentifier('updated_at DESC')).toThrow('Invalid column name');
        expect(() => escapeSqlTableIdentifier('catalog.products; DROP TABLE products')).toThrow(
            'Invalid table name',
        );
    });
});
