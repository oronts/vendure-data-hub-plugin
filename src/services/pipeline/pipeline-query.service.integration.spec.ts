import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Channel, ListQueryBuilder, type RequestContext } from '@vendure/core';
import { SortOrder } from '@vendure/common/lib/generated-types';
import { DataSource, EntitySchema } from 'typeorm';
import { Pipeline } from '../../entities/pipeline';
import {
    ConfigurationSource,
    PipelineStatus,
    StepType,
} from '../../constants/enums';
import { TABLE_NAMES } from '../../constants/table-names';
import type { PipelineDefinition } from '../../types';
import { PipelineQueryService } from './pipeline-query.service';

describe('PipelineQueryService capability filtering', () => {
    let dataSource: DataSource;
    let service: PipelineQueryService;
    let channel: Channel;

    beforeEach(async () => {
        dataSource = new DataSource({
            type: 'better-sqlite3',
            database: ':memory:',
            entities: [CHANNEL_SCHEMA, PIPELINE_SCHEMA],
            synchronize: true,
            logging: false,
        });
        await dataSource.initialize();

        const channelRepository = dataSource.getRepository(Channel);
        channel = await channelRepository.save(channelRepository.create({
            code: 'default',
            token: 'default-token',
        }));
        const connection = {
            rawConnection: dataSource,
            getRepository: (_ctx: RequestContext, entity: typeof Pipeline) => (
                dataSource.getRepository(entity)
            ),
        };
        const listQueryBuilder = new ListQueryBuilder(
            connection as never,
            {
                apiOptions: {
                    adminListQueryLimit: 100,
                    shopListQueryLimit: 100,
                },
                customFields: {},
            } as never,
        );
        service = new PipelineQueryService(
            connection as never,
            listQueryBuilder,
            {
                find: (_type: string, code: string) => code === 'productUpsert'
                    ? { requires: ['UpdateCatalog'] }
                    : undefined,
            } as never,
        );

        await seedPipeline('Alpha', definition(true, ['CATALOG']));
        await seedPipeline('Beta', definition(false, ['ORDERS']));
        await seedPipeline('Charlie', definition(true, ['CATALOG']));
        await seedPipeline('Delta', definition(false, ['CATALOG']));
        await seedPipeline('Echo', definition(true, ['INVENTORY']));
    });

    afterEach(async () => {
        await dataSource.destroy();
    });

    it('preserves Vendure sorting, pagination, and exact totals', async () => {
        const result = await service.findAll(requestContext(), {
            skip: 1,
            take: 1,
            sort: { name: SortOrder.ASC },
            filter: {
                _and: [{
                    requiredCapabilities: { eq: 'UpdateCatalog' },
                }, {
                    writeCapabilities: { in: ['CATALOG', 'INVENTORY'] },
                }],
            },
        });

        expect(result.totalItems).toBe(3);
        expect(result.items.map(item => item.name)).toEqual(['Charlie']);
    });

    it('returns an empty page without issuing an invalid empty IN predicate', async () => {
        await expect(service.findAll(requestContext(), {
            take: 10,
            filter: {
                requiredCapabilities: { eq: 'UpdateOrder' },
            },
        })).resolves.toEqual({ items: [], totalItems: 0 });
    });

    async function seedPipeline(
        name: string,
        pipelineDefinition: PipelineDefinition,
    ): Promise<void> {
        const repository = dataSource.getRepository(Pipeline);
        await repository.save(repository.create({
            code: name.toLowerCase(),
            name,
            enabled: true,
            configurationSource: ConfigurationSource.DATABASE,
            version: 1,
            definition: pipelineDefinition,
            status: PipelineStatus.PUBLISHED,
            currentRevisionId: null,
            draftRevisionId: null,
            publishedVersionCount: 0,
            publishedAt: null,
            publishedByUserId: null,
            rowVersion: 1,
            channels: [channel],
        }));
    }
});

function requestContext(): RequestContext {
    return {
        apiType: 'admin',
        channelId: 1,
    } as RequestContext;
}

function definition(
    requiresCatalog: boolean,
    writes: PipelineDefinition['capabilities'] extends infer T
        ? T extends { writes?: infer W } ? W : never
        : never,
): PipelineDefinition {
    return {
        version: 1,
        capabilities: { writes },
        steps: requiresCatalog
            ? [{
                key: 'load',
                type: StepType.LOAD,
                config: { adapterCode: 'productUpsert' },
            }]
            : [{ key: 'transform', type: StepType.TRANSFORM, config: {} }],
    };
}

const CHANNEL_SCHEMA = new EntitySchema<Channel>({
    name: 'Channel',
    target: Channel,
    tableName: 'test_channel',
    columns: {
        id: { type: Number, primary: true, generated: 'increment' },
        createdAt: { type: 'datetime', createDate: true },
        updatedAt: { type: 'datetime', updateDate: true },
        code: { type: String, unique: true },
        token: { type: String, unique: true },
    },
});

const PIPELINE_SCHEMA = new EntitySchema<Pipeline>({
    name: 'Pipeline',
    target: Pipeline,
    tableName: TABLE_NAMES.PIPELINE,
    columns: {
        id: { type: Number, primary: true, generated: 'increment' },
        createdAt: { type: 'datetime', createDate: true },
        updatedAt: { type: 'datetime', updateDate: true },
        code: { type: String, unique: true },
        name: { type: String },
        enabled: { type: Boolean },
        configurationSource: { type: String },
        version: { type: Number },
        definition: { type: 'simple-json' },
        status: { type: String },
        publishedAt: { type: 'datetime', nullable: true },
        publishedByUserId: { type: String, nullable: true },
        currentRevisionId: { type: Number, nullable: true },
        draftRevisionId: { type: Number, nullable: true },
        publishedVersionCount: { type: Number },
        rowVersion: { type: Number },
    },
    relations: {
        channels: {
            type: 'many-to-many',
            target: 'Channel',
            joinTable: { name: 'test_pipeline_channels' },
        },
    },
});
