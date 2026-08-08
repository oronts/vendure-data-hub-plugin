import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource, EntitySchema, type EntityManager } from 'typeorm';
import type {
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { LogPersistenceLevel } from '../../constants/enums';
import { DataHubSettings } from '../../entities/config';
import { DataHubSettingsService } from './settings.service';

function createSettings(): DataHubSettings {
    return Object.assign(new DataHubSettings(), {
        id: 1,
        scope: 'global',
        retentionDaysRuns: null,
        retentionDaysErrors: null,
        retentionDaysLogs: null,
        logPersistenceLevel: LogPersistenceLevel.PIPELINE,
        autoMapperConfig: null,
        pipelineAutoMapperConfigs: null,
        consumerControlOverrides: null,
    });
}

function createFixture(
    rows: Array<DataHubSettings | null>,
    databaseType = 'postgres',
) {
    const execute = vi.fn(async () => undefined);
    const queryBuilder = {
        insert: vi.fn(),
        into: vi.fn(),
        values: vi.fn(),
        orIgnore: vi.fn(),
        execute,
    };
    queryBuilder.insert.mockReturnValue(queryBuilder);
    queryBuilder.into.mockReturnValue(queryBuilder);
    queryBuilder.values.mockReturnValue(queryBuilder);
    queryBuilder.orIgnore.mockReturnValue(queryBuilder);
    const repository = {
        findOne: vi.fn(async () => rows.shift() ?? null),
        createQueryBuilder: vi.fn(() => queryBuilder),
        save: vi.fn(async (row: DataHubSettings) => row),
    };
    const withTransaction = vi.fn(async (
        ctx: RequestContext,
        work: (transactionCtx: RequestContext) => Promise<unknown>,
    ) => work(ctx));
    const connection = {
        rawConnection: { options: { type: databaseType } },
        getRepository: vi.fn(() => repository),
        withTransaction,
    };
    const requestContextService = {
        create: vi.fn(async () => ({ apiType: 'admin' } as unknown as RequestContext)),
    };
    return {
        service: new DataHubSettingsService(
            connection as unknown as TransactionalConnection,
            requestContextService as unknown as RequestContextService,
        ),
        connection,
        requestContextService,
        repository,
        queryBuilder,
        withTransaction,
    };
}

describe('DataHubSettingsService', () => {
    it('uses the resolver transaction context for reads', async () => {
        const row = createSettings();
        const fixture = createFixture([row]);
        const ctx = { apiType: 'admin' } as unknown as RequestContext;

        await expect(fixture.service.get(ctx)).resolves.toMatchObject({
            logPersistenceLevel: LogPersistenceLevel.PIPELINE,
        });

        expect(fixture.connection.getRepository).toHaveBeenCalledWith(
            ctx,
            DataHubSettings,
        );
        expect(fixture.requestContextService.create).not.toHaveBeenCalled();
    });

    it('initializes the singleton with an atomic insert-or-ignore', async () => {
        const row = createSettings();
        const fixture = createFixture([null, row]);

        await fixture.service.get();

        expect(fixture.queryBuilder.orIgnore).toHaveBeenCalledOnce();
        expect(fixture.queryBuilder.values).toHaveBeenCalledWith(
            expect.objectContaining({
                scope: 'global',
                consumerControlOverrides: null,
            }),
        );
        expect(fixture.repository.findOne).toHaveBeenCalledTimes(2);
    });

    it('updates settings inside the supplied request context', async () => {
        const row = createSettings();
        const fixture = createFixture([row]);
        row.consumerControlOverrides = { 'orders:incoming': false };
        const ctx = { apiType: 'admin' } as unknown as RequestContext;

        const result = await fixture.service.set({
            retentionDaysRuns: 30,
        }, ctx);

        expect(row.retentionDaysRuns).toBe(30);
        expect(result.retentionDaysRuns).toBe(30);
        expect(row.consumerControlOverrides).toEqual({ 'orders:incoming': false });
        expect(fixture.repository.save).toHaveBeenCalledWith(row);
        expect(fixture.requestContextService.create).not.toHaveBeenCalled();
        expect(fixture.repository.findOne).toHaveBeenCalledWith({
            where: { scope: 'global' },
            lock: { mode: 'pessimistic_write' },
        });
    });

    it('merges consumer overrides under a singleton row lock', async () => {
        const row = createSettings();
        row.consumerControlOverrides = { 'orders:incoming': false };
        const fixture = createFixture([row]);
        const ctx = { apiType: 'admin' } as unknown as RequestContext;

        await expect(fixture.service.updateConsumerControlOverrides(
            { 'catalog:updates': true },
            ctx,
        )).resolves.toEqual({
            'orders:incoming': false,
            'catalog:updates': true,
        });

        expect(fixture.withTransaction).toHaveBeenCalledWith(ctx, expect.any(Function));
        expect(fixture.repository.findOne).toHaveBeenCalledWith({
            where: { scope: 'global' },
            lock: { mode: 'pessimistic_write' },
        });
        expect(fixture.repository.save).toHaveBeenCalledWith(row);
    });

    it('preserves consumer intent while updating AutoMapper settings', async () => {
        const row = createSettings();
        row.consumerControlOverrides = { 'orders:incoming': false };
        const fixture = createFixture([row, row]);
        const ctx = { apiType: 'admin' } as unknown as RequestContext;

        await expect(fixture.service.updateAutoMapperConfig({
            confidenceThreshold: 0.85,
        }, ctx)).resolves.toMatchObject({ confidenceThreshold: 0.85 });

        expect(row.consumerControlOverrides).toEqual({ 'orders:incoming': false });
        expect(fixture.repository.findOne).toHaveBeenCalledWith({
            where: { scope: 'global' },
            lock: { mode: 'pessimistic_write' },
        });
        expect(fixture.repository.save).toHaveBeenCalledWith(row);
    });
    it('reads persisted consumer intent after service recreation', async () => {
        const row = createSettings();
        row.consumerControlOverrides = { 'orders:incoming': false };
        const first = createFixture([row]);
        const second = createFixture([row]);

        await expect(first.service.getConsumerControlOverrides()).resolves.toEqual({
            'orders:incoming': false,
        });
        await expect(second.service.getConsumerControlOverrides()).resolves.toEqual({
            'orders:incoming': false,
        });
    });
});

const SQLITE_SETTINGS_SCHEMA = new EntitySchema<DataHubSettings>({
    name: 'DataHubSettings',
    target: DataHubSettings,
    tableName: 'data_hub_settings',
    columns: {
        id: { type: Number, primary: true, generated: 'increment' },
        createdAt: { type: 'datetime', createDate: true },
        updatedAt: { type: 'datetime', updateDate: true },
        scope: { type: String, length: 32, default: 'global', unique: true },
        retentionDaysRuns: { type: Number, nullable: true },
        retentionDaysErrors: { type: Number, nullable: true },
        retentionDaysLogs: { type: Number, nullable: true },
        logPersistenceLevel: {
            type: String,
            length: 20,
            default: LogPersistenceLevel.PIPELINE,
        },
        autoMapperConfig: { type: 'simple-json', nullable: true },
        pipelineAutoMapperConfigs: { type: 'simple-json', nullable: true },
        consumerControlOverrides: { type: 'simple-json', nullable: true },
    },
});

describe('DataHubSettingsService SQLite integration', () => {
    type SqliteRequestContext = RequestContext & { manager?: EntityManager };

    let dataSource: DataSource;
    let service: DataHubSettingsService;

    beforeAll(async () => {
        dataSource = new DataSource({
            type: 'better-sqlite3',
            database: ':memory:',
            entities: [SQLITE_SETTINGS_SCHEMA],
            synchronize: true,
            logging: false,
        });
        await dataSource.initialize();

        const connection = {
            rawConnection: dataSource,
            getRepository: (ctx: SqliteRequestContext, entity: typeof DataHubSettings) => (
                ctx.manager?.getRepository(entity) ?? dataSource.getRepository(entity)
            ),
            withTransaction: async (
                ctx: SqliteRequestContext,
                work: (transactionCtx: SqliteRequestContext) => Promise<unknown>,
            ) => dataSource.transaction(manager => work({ ...ctx, manager } as SqliteRequestContext)),
        };
        const requestContextService = {
            create: async () => ({ apiType: 'admin' } as SqliteRequestContext),
        };
        service = new DataHubSettingsService(
            connection as unknown as TransactionalConnection,
            requestContextService as unknown as RequestContextService,
        );
    });

    afterAll(async () => {
        if (dataSource.isInitialized) {
            await dataSource.destroy();
        }
    });

    it('serializes concurrent mutations without requesting an unsupported row lock', async () => {
        await Promise.all([
            service.updateConsumerControlOverrides({ 'orders:incoming': false }),
            service.set({ retentionDaysRuns: 30 }),
            service.updateAutoMapperConfig({ confidenceThreshold: 0.85 }),
        ]);

        const persisted = await dataSource.getRepository(DataHubSettings).findOneByOrFail({
            scope: 'global',
        });
        expect(persisted.consumerControlOverrides).toEqual({
            'orders:incoming': false,
        });
        expect(persisted.retentionDaysRuns).toBe(30);
        expect(persisted.autoMapperConfig).toMatchObject({
            confidenceThreshold: 0.85,
        });
    });
});
