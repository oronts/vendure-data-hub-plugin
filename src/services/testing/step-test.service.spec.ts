import { describe, expect, it, vi } from 'vitest';
import { PAGINATION, TRANSFORM_LIMITS } from '../../constants';
import { StepTestService } from './step-test.service';

function createFixture() {
    const extractExecutor = { preview: vi.fn() };
    const transformExecutor = {
        executeOperator: vi.fn(),
        executeValidate: vi.fn(),
    };
    const loadExecutor = { simulate: vi.fn() };
    const executionPermissions = {
        assertAllowed: vi.fn(async () => undefined),
    };
    return {
        service: new StepTestService(
            extractExecutor as never,
            transformExecutor as never,
            loadExecutor as never,
            executionPermissions as never,
        ),
        extractExecutor,
        transformExecutor,
        loadExecutor,
        executionPermissions,
        ctx: { userHasPermissions: vi.fn(() => true) },
    };
}

describe('StepTestService records input', () => {
    it.each([
        0,
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT + 1,
    ])('rejects invalid extract preview limit %s without executing', async limit => {
        const fixture = createFixture();

        await expect(fixture.service.previewExtract(
            fixture.ctx as never,
            { config: { adapterCode: 'generator', count: 1 } },
            { limit },
        )).rejects.toThrow(
            `limit must be an integer between 1 and ${TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT}`,
        );
        expect(fixture.extractExecutor.preview).not.toHaveBeenCalled();
    });

    it('passes the maximum preview limit to the executor context', async () => {
        const fixture = createFixture();
        fixture.extractExecutor.preview.mockResolvedValue({ records: [] });

        await fixture.service.previewExtract(
            fixture.ctx as never,
            { config: { adapterCode: 'generator', count: 1 } },
            { limit: TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT },
        );

        expect(fixture.extractExecutor.preview).toHaveBeenCalledWith(
            fixture.ctx,
            expect.objectContaining({ type: 'EXTRACT' }),
            TRANSFORM_LIMITS.MAX_PREVIEW_LIMIT,
        );
    });

    it('rejects connection-backed previews without resource permissions', async () => {
        const fixture = createFixture();
        fixture.executionPermissions.assertAllowed.mockRejectedValueOnce(
            new Error(
                'Missing required permissions for this pipeline: UseDataHubConnection, UseDataHubSecret',
            ),
        );

        await expect(fixture.service.previewExtract(
            fixture.ctx as never,
            {
                config: {
                    adapterCode: 'httpApi',
                    connectionCode: 'trusted-api',
                    url: 'https://attacker.example/collect',
                },
            },
        )).rejects.toThrow(
            'UseDataHubConnection, UseDataHubSecret',
        );
        expect(fixture.extractExecutor.preview).not.toHaveBeenCalled();
    });

    it('preserves a source-reported total count', async () => {
        const fixture = createFixture();
        fixture.extractExecutor.preview.mockResolvedValue({
            records: [{ data: { id: 'preview-record' } }],
            totalAvailable: 25,
        });

        await expect(fixture.service.previewExtract(
            fixture.ctx as never,
            { config: { adapterCode: 'generator', count: 25 } },
            { limit: 1 },
        )).resolves.toEqual({
            records: [{ id: 'preview-record' }],
            totalCount: 25,
            notes: [],
        });
    });

    it.each([
        ['transform', 'simulateTransform'],
        ['validate', 'simulateValidate'],
        ['load', 'validateLoadConfig'],
    ] as const)('rejects a non-array %s records value', async (_name, method) => {
        const fixture = createFixture();

        await expect(fixture.service[method](
            fixture.ctx as never,
            { config: {} },
            { sku: 'SKU-1' },
        )).rejects.toThrow('records must be an array of JSON objects');
    });

    it('rejects scalar array elements', async () => {
        const fixture = createFixture();

        await expect(fixture.service.simulateTransform(
            fixture.ctx as never,
            { config: {} },
            [{ sku: 'SKU-1' }, 'invalid'],
        )).rejects.toThrow('records[1] must be a JSON object');
        expect(fixture.transformExecutor.executeOperator).not.toHaveBeenCalled();
    });

    it('rejects an unbounded records sample', async () => {
        const fixture = createFixture();
        const records = Array.from(
            { length: PAGINATION.MAX_QUERY_LIMIT + 1 },
            (_, index) => ({ index }),
        );

        await expect(fixture.service.validateLoadConfig(
            fixture.ctx as never,
            { config: {} },
            records,
        )).rejects.toThrow(`records cannot exceed ${PAGINATION.MAX_QUERY_LIMIT} items`);
        expect(fixture.loadExecutor.simulate).not.toHaveBeenCalled();
    });

    it('passes a schema reference to validate simulation', async () => {
        const fixture = createFixture();
        fixture.transformExecutor.executeValidate.mockResolvedValue([]);

        await fixture.service.simulateValidate(
            fixture.ctx as never,
            {
                config: {},
                schemaRef: {
                    schemaId: 'catalog.product',
                    version: '1.0.0',
                },
            },
            [{ sku: 'SKU-1' }],
        );

        expect(fixture.transformExecutor.executeValidate).toHaveBeenCalledWith(
            fixture.ctx,
            expect.objectContaining({
                schemaRef: {
                    schemaId: 'catalog.product',
                    version: '1.0.0',
                },
            }),
            [{ sku: 'SKU-1' }],
        );
    });
});
