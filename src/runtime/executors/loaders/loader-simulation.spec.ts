import { describe, expect, it } from 'vitest';
import { IMPACT_ANALYSIS } from '../../../constants/defaults/runtime-defaults';
import { LoadStrategy } from '../../../constants/enums';
import {
    createUpsertSimulationDetail,
    summarizeSimulationDetails,
    toSimulationObject,
} from './loader-simulation';

describe('loader simulation details', () => {
    it('matches create, update, duplicate, and update-missing strategy outcomes', () => {
        const record = { sku: 'SKU-1', name: 'New name' };
        const create = createUpsertSimulationDetail({
            record,
            index: 0,
            entityType: 'ProductVariant',
            existing: null,
        });
        const update = createUpsertSimulationDetail({
            record,
            index: 0,
            entityType: 'ProductVariant',
            existing: { id: 1, sku: 'SKU-1', name: 'Old name' },
        });
        const duplicate = createUpsertSimulationDetail({
            record,
            index: 0,
            entityType: 'ProductVariant',
            existing: { id: 1, sku: 'SKU-1' },
            strategy: LoadStrategy.CREATE,
            skipDuplicates: true,
        });
        const missingUpdate = createUpsertSimulationDetail({
            record,
            index: 0,
            entityType: 'ProductVariant',
            existing: null,
            strategy: LoadStrategy.UPDATE,
        });

        expect(create.operation).toBe('CREATE');
        expect(update.operation).toBe('UPDATE');
        expect(duplicate.operation).toBe('SKIP');
        expect(missingUpdate.operation).toBe('ERROR');
        expect(summarizeSimulationDetails([
            create,
            update,
            duplicate,
            missingUpdate,
        ])).toEqual({
            wouldCreate: 1,
            wouldUpdate: 1,
            wouldDelete: 0,
            wouldSkip: 1,
            wouldFail: 1,
        });
    });

    it('bounds snapshots and omits circular references', () => {
        const value: Record<string, unknown> = {
            items: Array.from(
                { length: IMPACT_ANALYSIS.SNAPSHOT_MAX_ARRAY_ITEMS + 10 },
                (_, index) => index,
            ),
        };
        value.self = value;

        const snapshot = toSimulationObject(value);

        expect(snapshot?.items).toHaveLength(IMPACT_ANALYSIS.SNAPSHOT_MAX_ARRAY_ITEMS);
        expect(snapshot).not.toHaveProperty('self');
    });
});
