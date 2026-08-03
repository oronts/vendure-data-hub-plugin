import { describe, expect, it, vi } from 'vitest';
import { VendureQueryExtractor } from './vendure-query.extractor';

describe('VendureQueryExtractor configuration', () => {
    const extractor = new VendureQueryExtractor({} as never);

    it('accepts relation path arrays', async () => {
        const result = await extractor.validate({} as never, {
            entity: 'PRODUCT',
            relations: ['variants', 'variants.translations'],
        });

        expect(result).toEqual({ valid: true, errors: [] });
    });

    it('rejects legacy comma-separated relation strings', async () => {
        const result = await extractor.validate({} as never, {
            entity: 'PRODUCT',
            relations: 'variants,translations',
        } as never);

        expect(result).toEqual({
            valid: false,
            errors: [{
                field: 'relations',
                message: 'Relations must be an array of relation paths',
            }],
        });
    });

    it('rejects unsafe batch sizes', async () => {
        const result = await extractor.validate({} as never, {
            entity: 'PRODUCT',
            batchSize: 10_001,
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual({
            field: 'batchSize',
            message: 'Batch size must be an integer from 1 to 10000',
        });
    });

    it('scopes extraction to the active channel and builds nested relation joins', async () => {
        const queryBuilder = createQueryBuilderMock();
        queryBuilder.getMany
            .mockResolvedValueOnce([{ id: 1, createdAt: new Date('2026-01-01') }])
            .mockResolvedValueOnce([]);
        const connection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => queryBuilder) })),
        };
        const instance = new VendureQueryExtractor(connection as never);
        const context = createContext(42);

        const records = [];
        for await (const record of instance.extract(context as never, {
            entity: 'PRODUCT',
            relations: ['variants', 'variants.translations'],
        })) {
            records.push(record);
        }

        expect(records).toHaveLength(1);
        expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
            'entity.channels',
            'dataHubActiveChannel',
            'dataHubActiveChannel.id = :dataHubActiveChannelId',
            { dataHubActiveChannelId: 42 },
        );
        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
            'entity.variants',
            'dataHubRelation1',
        );
        expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
            'dataHubRelation1.translations',
            'dataHubRelation2',
        );
        expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('entity.id', 'ASC');
    });

    it('applies the same scoped query contract to preview', async () => {
        const queryBuilder = createQueryBuilderMock();
        queryBuilder.getManyAndCount.mockResolvedValue([[{ id: 1 }], 1]);
        const connection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => queryBuilder) })),
        };
        const instance = new VendureQueryExtractor(connection as never);

        const result = await instance.preview(createContext('channel-1') as never, {
            entity: 'PRODUCT',
            filters: [{ field: 'enabled', operator: 'eq', value: true }],
            sortBy: 'updatedAt',
        }, 5);

        expect(result.totalAvailable).toBe(1);
        expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
            'entity.channels',
            'dataHubActiveChannel',
            'dataHubActiveChannel.id = :dataHubActiveChannelId',
            { dataHubActiveChannelId: 'channel-1' },
        );
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
            'entity.enabled = :filter_enabled',
            { filter_enabled: true },
        );
        expect(queryBuilder.orderBy).toHaveBeenCalledWith('entity.updatedAt', 'ASC');
        expect(queryBuilder.take).toHaveBeenCalledWith(5);
    });

    it('bounds non-finite preview limits', async () => {
        const queryBuilder = createQueryBuilderMock();
        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
        const connection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => queryBuilder) })),
        };
        const instance = new VendureQueryExtractor(connection as never);

        await instance.preview(createContext('channel-1') as never, {
            entity: 'PRODUCT',
        }, Number.POSITIVE_INFINITY);

        expect(queryBuilder.take).toHaveBeenCalledWith(10);
    });
});

function createQueryBuilderMock() {
    return {
        alias: 'entity',
        innerJoin: vi.fn().mockReturnThis(),
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn(),
        getManyAndCount: vi.fn(),
    };
}

function createContext(channelId: string | number) {
    return {
        ctx: { channelId },
        isCancelled: vi.fn().mockResolvedValue(false),
        setCheckpoint: vi.fn(),
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            error: vi.fn(),
        },
    };
}
