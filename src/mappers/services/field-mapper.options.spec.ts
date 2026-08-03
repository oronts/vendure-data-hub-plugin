import { describe, expect, it } from 'vitest';
import { FieldMapperService } from './field-mapper.service';

describe('FieldMapperService transform options', () => {
    it('honors split trimming and regex replacement', () => {
        const result = new FieldMapperService().mapRecord(
            {
                tags: ' first, second ',
                code: 'SKU--42',
            },
            [
                {
                    source: 'tags',
                    target: 'tags',
                    transforms: [{
                        type: 'split',
                        split: { delimiter: ',', trim: true },
                    }],
                },
                {
                    source: 'code',
                    target: 'code',
                    transforms: [{
                        type: 'replace',
                        replace: {
                            search: '-+',
                            replacement: '-',
                            regex: true,
                        },
                    }],
                },
            ],
        );

        expect(result).toMatchObject({
            success: true,
            data: {
                tags: ['first', 'second'],
                code: 'SKU-42',
            },
        });
    });

    it('supports unconditional defaults when onlyIfEmpty is disabled', () => {
        const result = new FieldMapperService().mapRecord(
            { status: 'legacy' },
            [{
                source: 'status',
                target: 'status',
                transforms: [{
                    type: 'default',
                    default: { value: 'active', onlyIfEmpty: false },
                }],
            }],
        );

        expect(result.data).toEqual({ status: 'active' });
    });

    it('does not mutate source arrays while joining additional fields', () => {
        const source = { tags: ['first', 'second'], suffix: 'third' };
        const result = new FieldMapperService().mapRecord(
            source,
            [{
                source: 'tags',
                target: 'summary',
                transforms: [{
                    type: 'join',
                    join: { delimiter: ',', fields: ['suffix'] },
                }],
            }],
        );

        expect(result.data).toEqual({ summary: 'first,second,third' });
        expect(source.tags).toEqual(['first', 'second']);
    });

    it('does not resolve inherited value-map properties', () => {
        const result = new FieldMapperService().mapRecord(
            { status: 'toString' },
            [{
                source: 'status',
                target: 'status',
                transforms: [{
                    type: 'map',
                    map: {
                        values: { active: true },
                        default: 'unknown',
                        caseSensitive: false,
                    },
                }],
            }],
        );

        expect(result.data).toEqual({ status: 'unknown' });
    });

    it('uses the lookup fallback when the matched row has no output field', () => {
        const mapper = new FieldMapperService();
        mapper.registerMapperLookupTable({
            name: 'categories',
            data: [{ code: 'hardware' }],
        });

        const result = mapper.mapRecord(
            { category: 'hardware' },
            [{
                source: 'category',
                target: 'categoryName',
                transforms: [{
                    type: 'lookup',
                    lookup: {
                        table: 'categories',
                        fromField: 'code',
                        toField: 'name',
                        default: 'Unknown',
                    },
                }],
            }],
        );

        expect(result.data).toEqual({ categoryName: 'Unknown' });
    });
});
