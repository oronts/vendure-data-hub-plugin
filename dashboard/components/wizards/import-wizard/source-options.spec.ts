import { describe, expect, it } from 'vitest';
import {
    getAdapterCodeForSourceType,
    getDynamicSourceOptions,
} from './source-options';

describe('import source options', () => {
    it('keeps backend metadata for visible dynamic extractors', () => {
        expect(getDynamicSourceOptions([
            {
                code: 'database',
                name: 'Database',
                description: 'Read database rows',
                icon: 'database',
            },
            {
                code: 'internal',
                name: 'Internal',
                wizardHidden: true,
            },
        ])).toEqual([{
            id: 'database',
            label: 'Database',
            description: 'Read database rows',
            iconName: 'database',
        }]);
    });

    it('excludes adapters represented by smart source UIs', () => {
        expect(getDynamicSourceOptions([
            { code: 'csv', name: 'CSV' },
            { code: 'httpApi', name: 'HTTP API' },
            { code: 'file', name: 'File' },
            { code: 'customSource' },
        ])).toEqual([{
            id: 'customSource',
            label: 'customSource',
            description: '',
            iconName: undefined,
        }]);
    });

    it('preserves backend adapter casing during source resolution', () => {
        const extractors = [{ code: 'customApi' }, { code: 'database' }];

        expect(getAdapterCodeForSourceType('CUSTOMAPI', extractors))
            .toBe('customApi');
        expect(getAdapterCodeForSourceType('UNKNOWN', extractors))
            .toBe('unknown');
    });
});
