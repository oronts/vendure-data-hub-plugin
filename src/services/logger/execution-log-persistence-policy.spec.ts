import { describe, expect, it, vi } from 'vitest';

import { LogPersistenceLevel } from '../../constants/enums';
import type { DataHubSettingsService } from '../config/settings.service';
import { ExecutionLogPersistencePolicy } from './execution-log-persistence-policy';

function createSettings(level: LogPersistenceLevel): {
    settings: DataHubSettingsService;
    getLevel: ReturnType<typeof vi.fn>;
} {
    const getLevel = vi.fn(async () => level);
    return {
        settings: {
            getLogPersistenceLevel: getLevel,
        } as unknown as DataHubSettingsService,
        getLevel,
    };
}

describe('ExecutionLogPersistencePolicy', () => {
    it('caches the current level briefly and refreshes after expiry', async () => {
        vi.useFakeTimers();
        const { settings, getLevel } = createSettings(LogPersistenceLevel.STEP);
        const policy = new ExecutionLogPersistencePolicy(settings);
        try {
            await expect(policy.getCurrentLevel()).resolves.toBe(LogPersistenceLevel.STEP);
            await expect(policy.getCurrentLevel()).resolves.toBe(LogPersistenceLevel.STEP);
            expect(getLevel).toHaveBeenCalledOnce();

            vi.advanceTimersByTime(1_001);
            await expect(policy.getCurrentLevel()).resolves.toBe(LogPersistenceLevel.STEP);
            expect(getLevel).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('deduplicates concurrent settings refreshes', async () => {
        const { settings, getLevel } = createSettings(LogPersistenceLevel.DEBUG);
        const policy = new ExecutionLogPersistencePolicy(settings);

        await expect(Promise.all([
            policy.getCurrentLevel(),
            policy.getCurrentLevel(),
        ])).resolves.toEqual([
            LogPersistenceLevel.DEBUG,
            LogPersistenceLevel.DEBUG,
        ]);
        expect(getLevel).toHaveBeenCalledOnce();
    });

    it('contains settings and persistence failures', async () => {
        const settingsFailure = new ExecutionLogPersistencePolicy({
            getLogPersistenceLevel: vi.fn(async () => {
                throw new Error('settings unavailable');
            }),
        } as unknown as DataHubSettingsService);
        const write = vi.fn(async () => undefined);
        const onFailure = vi.fn();

        await expect(settingsFailure.persist('pipeline.start', write, onFailure)).resolves.toBeUndefined();
        expect(write).not.toHaveBeenCalled();
        expect(onFailure).toHaveBeenCalledOnce();

        const { settings } = createSettings(LogPersistenceLevel.DEBUG);
        const persistenceFailure = new ExecutionLogPersistencePolicy(settings);
        await expect(persistenceFailure.persist(
            'debug',
            async () => { throw new Error('database unavailable'); },
            onFailure,
        )).resolves.toBeUndefined();
        expect(onFailure).toHaveBeenCalledTimes(2);
    });

    it('preserves the complete persistence hierarchy', () => {
        const { settings } = createSettings(LogPersistenceLevel.ERROR_ONLY);
        const policy = new ExecutionLogPersistencePolicy(settings);

        expect(policy.shouldPersist('pipeline.fail', LogPersistenceLevel.ERROR_ONLY)).toBe(true);
        expect(policy.shouldPersist('pipeline.start', LogPersistenceLevel.ERROR_ONLY)).toBe(false);
        expect(policy.shouldPersist('pipeline.complete', LogPersistenceLevel.PIPELINE)).toBe(true);
        expect(policy.shouldPersist('step.start', LogPersistenceLevel.PIPELINE)).toBe(false);
        expect(policy.shouldPersist('step.complete', LogPersistenceLevel.STEP)).toBe(true);
        expect(policy.shouldPersist('debug', LogPersistenceLevel.STEP)).toBe(false);
        expect(policy.shouldPersist('transform.mapping', LogPersistenceLevel.DEBUG)).toBe(true);
        expect(policy.shouldPersist('extract.source', LogPersistenceLevel.DEBUG)).toBe(true);
        expect(policy.shouldPersist('load.target', LogPersistenceLevel.DEBUG)).toBe(true);
        expect(policy.shouldPersist('record.error', LogPersistenceLevel.DEBUG)).toBe(true);
    });
});
