import { describe, expect, it } from 'vitest';
import { parseInlineExportDestination } from './inline-export-destination';

describe('inline pipeline export destinations', () => {
    it('builds a canonical local destination', () => {
        expect(parseInlineExportDestination('catalog-export', {
            destinationType: 'LOCAL',
            directory: 'catalog/daily',
        })).toEqual({
            id: 'pipeline:catalog-export',
            name: 'Pipeline export catalog-export',
            type: 'LOCAL',
            enabled: true,
            directory: 'catalog/daily',
        });
    });

    it('builds a canonical HTTP destination using url and Secret Codes', () => {
        expect(parseInlineExportDestination('partner-export', {
            destinationType: 'HTTP',
            url: 'https://partner.example.com/import',
            method: 'PUT',
            headers: { 'X-Tenant': 'catalog' },
            headerSecretCodes: { Authorization: 'partner-token' },
        })).toMatchObject({
            type: 'HTTP',
            url: 'https://partner.example.com/import',
            method: 'PUT',
            headers: { 'X-Tenant': 'catalog' },
            headerSecretCodes: { Authorization: 'partner-token' },
        });
    });

    it.each(['FILE', 'DOWNLOAD', 'WEBHOOK', 'UNKNOWN'])(
        'rejects unsupported destination %s instead of falling back to local output',
        destinationType => {
            expect(() => parseInlineExportDestination('export', {
                destinationType,
                directory: '.',
            })).toThrow(`Unsupported pipeline export destination type "${destinationType}"`);
        },
    );

    it('rejects sensitive plaintext HTTP headers', () => {
        expect(() => parseInlineExportDestination('export', {
            destinationType: 'HTTP',
            url: 'https://partner.example.com/import',
            headers: { Authorization: 'Bearer plaintext' },
        })).toThrow(/plaintext credentials|secret-backed authentication/);
    });

    it('does not interpret endpoint as the canonical HTTP URL', () => {
        expect(() => parseInlineExportDestination('export', {
            destinationType: 'HTTP',
            endpoint: 'https://partner.example.com/import',
        })).toThrow('Destination field "url"');
    });
});
