import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractorContext, RecordEnvelope } from '../../types';
import { CdcExtractor } from './cdc.extractor';
import { createDatabaseClient } from '../database/connection-pool';
import type { DatabaseClient } from '../database/connection-pool';
import type { CdcExtractorConfig } from './types';
import { PAGINATION } from '../../constants';

vi.mock('../database/connection-pool', async importOriginal => {
    const original = await importOriginal<typeof import('../database/connection-pool')>();
    return {
        ...original,
        createDatabaseClient: vi.fn(),
    };
});

const TRACKING_VALUE = '2026-07-18T10:00:00.000Z';

const baseConfig: CdcExtractorConfig = {
    adapterCode: 'cdc',
    databaseType: 'POSTGRESQL',
    connectionCode: 'catalog-db',
    table: 'products',
    trackingColumn: 'updated_at',
    trackingType: 'TIMESTAMP',
    primaryKey: 'id',
    batchSize: 2,
};

function createContext(checkpointData: Record<string, string | number> = {}): ExtractorContext {
    return {
        checkpoint: { data: checkpointData },
        connections: {
            getRequired: vi.fn().mockResolvedValue({
                code: 'catalog-db',
                type: 'POSTGRES',
                config: {
                    host: 'db.example.test',
                    database: 'catalog',
                    username: 'data_hub',
                },
            }),
        },
        isCancelled: vi.fn().mockResolvedValue(false),
        setCheckpoint: vi.fn(),
        logger: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    } as unknown as ExtractorContext;
}

async function collect(
    extractor: CdcExtractor,
    context: ExtractorContext,
    config: CdcExtractorConfig = baseConfig,
): Promise<RecordEnvelope[]> {
    const records: RecordEnvelope[] = [];
    for await (const record of extractor.extract(context, config)) {
        records.push(record);
    }
    return records;
}

describe('CdcExtractor checkpoints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('checkpoints the primary key at a tied tracking-value boundary', async () => {
        const rows = [
            { id: 41, updated_at: TRACKING_VALUE },
            { id: 42, updated_at: TRACKING_VALUE },
        ];
        const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
        const close = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createDatabaseClient).mockResolvedValue({ query, close } as DatabaseClient);
        const context = createContext();

        await expect(collect(new CdcExtractor(), context)).resolves.toHaveLength(2);

        expect(query).toHaveBeenCalledWith(
            'SELECT * FROM "products" WHERE "updated_at" IS NOT NULL ORDER BY "updated_at" ASC, "id" ASC LIMIT $1',
            [2],
        );
        expect(context.setCheckpoint).toHaveBeenCalledWith({
            lastTrackingValue: TRACKING_VALUE,
            lastTrackingPrimaryKey: 42,
        });
        expect(close).toHaveBeenCalledOnce();
    });

    it('resumes after the primary key when tracking values are tied', async () => {
        const row = { id: 42, updated_at: TRACKING_VALUE };
        const query = vi.fn().mockResolvedValue({ rows: [row], rowCount: 1 });
        const close = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createDatabaseClient).mockResolvedValue({ query, close } as DatabaseClient);
        const context = createContext({
            lastTrackingValue: TRACKING_VALUE,
            lastTrackingPrimaryKey: 41,
        });

        await expect(collect(new CdcExtractor(), context)).resolves.toEqual([
            expect.objectContaining({
                data: row,
                meta: expect.objectContaining({ _cdc_operation: 'UPDATE' }),
            }),
        ]);

        expect(query).toHaveBeenCalledWith(
            'SELECT * FROM "products" WHERE ("updated_at" > $1 OR ("updated_at" = $1 AND "id" > $2)) ORDER BY "updated_at" ASC, "id" ASC LIMIT $3',
            [TRACKING_VALUE, 41, 2],
        );
    });

    it('uses MySQL quoting for schema-qualified tables and selected columns', async () => {
        const row = { id: 42, name: 'Product', updated_at: TRACKING_VALUE };
        const query = vi.fn().mockResolvedValue({ rows: [row], rowCount: 1 });
        const close = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createDatabaseClient).mockResolvedValue({ query, close } as DatabaseClient);

        await collect(
            new CdcExtractor(),
            createContext({
                lastTrackingValue: TRACKING_VALUE,
                lastTrackingPrimaryKey: 41,
            }),
            {
                ...baseConfig,
                databaseType: 'MYSQL',
                table: 'catalog.products',
                columns: ['name'],
            },
        );

        expect(query).toHaveBeenCalledWith(
            'SELECT `name`, `id`, `updated_at` FROM `catalog`.`products` WHERE (`updated_at` > ? OR (`updated_at` = ? AND `id` > ?)) ORDER BY `updated_at` ASC, `id` ASC LIMIT ?',
            [TRACKING_VALUE, TRACKING_VALUE, 41, 2],
        );
    });

    it('uses the same composite cursor for tied soft-delete timestamps', async () => {
        const deletedRow = {
            id: 8,
            updated_at: TRACKING_VALUE,
            deleted_at: TRACKING_VALUE,
        };
        const query = vi.fn()
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            .mockResolvedValueOnce({ rows: [deletedRow], rowCount: 1 });
        const close = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createDatabaseClient).mockResolvedValue({ query, close } as DatabaseClient);
        const context = createContext({
            lastTrackingValue: TRACKING_VALUE,
            lastTrackingPrimaryKey: 7,
            lastDeleteValue: TRACKING_VALUE,
            lastDeletePrimaryKey: 7,
        });

        const records = await collect(new CdcExtractor(), context, {
            ...baseConfig,
            includeDeletes: true,
            deleteColumn: 'deleted_at',
        });

        expect(records[0]?.meta?._cdc_operation).toBe('DELETE');
        expect(query).toHaveBeenNthCalledWith(
            1,
            'SELECT * FROM "products" WHERE "deleted_at" IS NULL AND ("updated_at" > $1 OR ("updated_at" = $1 AND "id" > $2)) ORDER BY "updated_at" ASC, "id" ASC LIMIT $3',
            [TRACKING_VALUE, 7, 2],
        );
        expect(query).toHaveBeenNthCalledWith(
            2,
            'SELECT * FROM "products" WHERE ("deleted_at" > $1 OR ("deleted_at" = $1 AND "id" > $2)) ORDER BY "deleted_at" ASC, "id" ASC LIMIT $3',
            [TRACKING_VALUE, 7, 2],
        );
        expect(context.setCheckpoint).toHaveBeenCalledWith({
            lastTrackingValue: TRACKING_VALUE,
            lastTrackingPrimaryKey: 7,
            lastDeleteValue: TRACKING_VALUE,
            lastDeletePrimaryKey: 8,
        });
    });

    it('does not start a delete scan after cancellation during the change scan', async () => {
        const rows = [
            { id: 8, updated_at: TRACKING_VALUE, deleted_at: null },
            { id: 9, updated_at: TRACKING_VALUE, deleted_at: null },
        ];
        const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
        vi.mocked(createDatabaseClient).mockResolvedValue({
            query,
            close: vi.fn().mockResolvedValue(undefined),
        } as DatabaseClient);
        const context = createContext({
            lastTrackingValue: TRACKING_VALUE,
            lastTrackingPrimaryKey: 7,
            lastDeleteValue: TRACKING_VALUE,
            lastDeletePrimaryKey: 7,
        });
        vi.mocked(context.isCancelled)
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);

        const records = await collect(new CdcExtractor(), context, {
            ...baseConfig,
            includeDeletes: true,
            deleteColumn: 'deleted_at',
        });

        expect(records.map(record => record.data.id)).toEqual([8]);
        expect(query).toHaveBeenCalledOnce();
        expect(context.setCheckpoint).toHaveBeenCalledWith({
            lastTrackingValue: TRACKING_VALUE,
            lastTrackingPrimaryKey: 8,
            lastDeleteValue: TRACKING_VALUE,
            lastDeletePrimaryKey: 7,
        });
    });

    it('fails closed when a checkpoint is missing its primary-key component', async () => {
        const query = vi.fn();
        const close = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createDatabaseClient).mockResolvedValue({ query, close } as DatabaseClient);

        await expect(collect(
            new CdcExtractor(),
            createContext({ lastTrackingValue: TRACKING_VALUE }),
        )).rejects.toThrow(
            'CDC checkpoint requires both "lastTrackingValue" and "lastTrackingPrimaryKey"',
        );

        expect(query).not.toHaveBeenCalled();
        expect(close).toHaveBeenCalledOnce();
    });

    it('fails closed when a returned row has no primary-key cursor value', async () => {
        const query = vi.fn().mockResolvedValue({
            rows: [{ updated_at: TRACKING_VALUE }],
            rowCount: 1,
        });
        const close = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createDatabaseClient).mockResolvedValue({ query, close } as DatabaseClient);

        await expect(collect(new CdcExtractor(), createContext())).rejects.toThrow(
            'CDC cursor column "id" must contain a non-null string or number',
        );
        expect(close).toHaveBeenCalledOnce();
    });

    it.each([0, 1.5, PAGINATION.DATABASE_MAX_PAGE_SIZE + 1])(
        'rejects unsafe batch size %s',
        async batchSize => {
            const result = await new CdcExtractor().validate(createContext(), {
                ...baseConfig,
                batchSize,
            });

            expect(result.errors).toContainEqual({
                field: 'batchSize',
                message: `Batch size must be an integer from 1 to ${PAGINATION.DATABASE_MAX_PAGE_SIZE}`,
            });
        },
    );

    it('uses dialect-correct composite ordering in previews', async () => {
        const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
        const close = vi.fn().mockResolvedValue(undefined);
        vi.mocked(createDatabaseClient).mockResolvedValue({ query, close } as DatabaseClient);

        const result = await new CdcExtractor().preview(createContext(), {
            ...baseConfig,
            databaseType: 'MYSQL',
            table: 'catalog.products',
            columns: ['name'],
        }, Number.NaN);

        expect(result.records).toEqual([]);
        expect(query).toHaveBeenCalledWith(
            'SELECT `name`, `id`, `updated_at` FROM `catalog`.`products` ORDER BY `updated_at` DESC, `id` DESC LIMIT ?',
            [10],
        );
        expect(close).toHaveBeenCalledOnce();
    });
});
