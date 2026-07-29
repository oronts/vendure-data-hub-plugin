import { describe, expect, it } from 'vitest';
import { rekeyHttpHeaderRow, upsertHttpHeaderRow } from './http-header-rows';

describe('HTTP header row identity', () => {
    it('moves the stable row id when a header is renamed', () => {
        const rowIds = new Map([['Authorization', 'row-1']]);

        rekeyHttpHeaderRow(rowIds, 'Authorization', 'X-Api-Key', 'row-1');

        expect(rowIds).toEqual(new Map([['X-Api-Key', 'row-1']]));
    });

    it('preserves another row that owns the previous name', () => {
        const rowIds = new Map([['Authorization', 'row-2']]);

        rekeyHttpHeaderRow(rowIds, 'Authorization', 'Accept', 'row-1');

        expect(rowIds).toEqual(new Map([
            ['Authorization', 'row-2'],
            ['Accept', 'row-1'],
        ]));
    });

    it('removes the key when the edited name becomes empty', () => {
        const rowIds = new Map([['Authorization', 'row-1']]);

        rekeyHttpHeaderRow(rowIds, 'Authorization', '  ', 'row-1');

        expect(rowIds.size).toBe(0);
    });

    it('keeps one stable draft row while its full name and value are typed', () => {
        const states = ['H', 'Ho', 'Hos', 'Host'].reduce(
            (rows, name) => upsertHttpHeaderRow(rows, {
                id: 'draft-1',
                name,
                value: '',
            }),
            [] as Array<{ id: string; name: string; value: string }>,
        );

        expect(states).toEqual([{ id: 'draft-1', name: 'Host', value: '' }]);
        expect(upsertHttpHeaderRow(states, {
            id: 'draft-1',
            name: 'Host',
            value: 'example.com',
        })).toEqual([{
            id: 'draft-1',
            name: 'Host',
            value: 'example.com',
        }]);
    });

    it('removes a committed draft when its name is cleared', () => {
        expect(upsertHttpHeaderRow(
            [{ id: 'draft-1', name: 'Host', value: 'example.com' }],
            { id: 'draft-1', name: ' ', value: 'example.com' },
        )).toEqual([]);
    });
});
