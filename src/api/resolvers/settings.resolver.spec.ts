import { describe, expect, it, vi } from 'vitest';
import { DataHubSettingsAdminResolver } from './settings.resolver';

function createFixture() {
    const settings = {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn(async input => input),
        getAutoMapperConfig: vi.fn().mockResolvedValue({ confidenceThreshold: 0.8 }),
        updateAutoMapperConfig: vi.fn().mockResolvedValue({ confidenceThreshold: 0.9 }),
        resetAutoMapperConfig: vi.fn().mockResolvedValue({ confidenceThreshold: 0.7 }),
        validateAutoMapperConfig: vi.fn(() => ({ valid: true, errors: [] })),
    };
    const connection = {
        getEntityOrThrow: vi.fn().mockResolvedValue({ id: 'pipeline-1' }),
    };
    const resolver = new DataHubSettingsAdminResolver(
        {} as never,
        settings as never,
        connection as never,
    );
    const ctx = { channelId: 'channel-a' };

    return { resolver, settings, connection, ctx };
}

describe('DataHubSettingsAdminResolver pipeline config isolation', () => {
    it('verifies channel visibility before reading pipeline config', async () => {
        const fixture = createFixture();

        await fixture.resolver.dataHubAutoMapperConfig(
            fixture.ctx as never,
            'pipeline-1',
        );

        expect(fixture.connection.getEntityOrThrow).toHaveBeenCalledWith(
            fixture.ctx,
            expect.any(Function),
            'pipeline-1',
            { channelId: 'channel-a' },
        );
        expect(fixture.settings.getAutoMapperConfig).toHaveBeenCalledWith(
            'pipeline-1',
            fixture.ctx,
        );
    });

    it('does not update pipeline config when channel visibility fails', async () => {
        const fixture = createFixture();
        fixture.connection.getEntityOrThrow.mockRejectedValue(new Error('not found'));

        await expect(fixture.resolver.updateDataHubAutoMapperConfig(
            fixture.ctx as never,
            { pipelineId: 'pipeline-1', confidenceThreshold: 0.9 },
        )).rejects.toThrow('not found');

        expect(fixture.settings.validateAutoMapperConfig).not.toHaveBeenCalled();
        expect(fixture.settings.updateAutoMapperConfig).not.toHaveBeenCalled();
    });

    it('does not reset pipeline config when channel visibility fails', async () => {
        const fixture = createFixture();
        fixture.connection.getEntityOrThrow.mockRejectedValue(new Error('not found'));

        await expect(fixture.resolver.resetDataHubAutoMapperConfig(
            fixture.ctx as never,
            'pipeline-1',
        )).rejects.toThrow('not found');

        expect(fixture.settings.resetAutoMapperConfig).not.toHaveBeenCalled();
    });

    it('keeps global config operations independent of a pipeline lookup', async () => {
        const fixture = createFixture();

        await fixture.resolver.dataHubAutoMapperConfig(fixture.ctx as never);
        await fixture.resolver.resetDataHubAutoMapperConfig(fixture.ctx as never);

        expect(fixture.connection.getEntityOrThrow).not.toHaveBeenCalled();
    });
});

describe('DataHubSettingsAdminResolver settings validation', () => {
    it('preserves explicit disable and reset values', async () => {
        const fixture = createFixture();

        await fixture.resolver.updateDataHubSettings(fixture.ctx as never, {
            retentionDaysRuns: 0,
            retentionDaysErrors: 365,
            retentionDaysLogs: null,
            logPersistenceLevel: 'PIPELINE',
        });

        expect(fixture.settings.set).toHaveBeenCalledWith({
            retentionDaysRuns: 0,
            retentionDaysErrors: 365,
            retentionDaysLogs: null,
            logPersistenceLevel: 'PIPELINE',
        }, fixture.ctx);
    });

    it.each([
        ['retentionDaysRuns', -1],
        ['retentionDaysErrors', 366],
        ['retentionDaysLogs', 1.5],
    ] as const)('rejects invalid %s values instead of silently clamping them', async (
        field,
        value,
    ) => {
        const fixture = createFixture();

        await expect(fixture.resolver.updateDataHubSettings(
            fixture.ctx as never,
            { [field]: value },
        )).rejects.toThrow(`${field} must be an integer between 0 and 365`);

        expect(fixture.settings.set).not.toHaveBeenCalled();
    });

    it('rejects unknown log persistence levels instead of ignoring them', async () => {
        const fixture = createFixture();

        await expect(fixture.resolver.updateDataHubSettings(
            fixture.ctx as never,
            { logPersistenceLevel: 'UNKNOWN' },
        )).rejects.toThrow('Unsupported log persistence level: UNKNOWN');

        expect(fixture.settings.set).not.toHaveBeenCalled();
    });
});
