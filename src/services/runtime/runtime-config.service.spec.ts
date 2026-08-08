import { describe, expect, it } from 'vitest';
import { SCHEDULER } from '../../constants/defaults';
import type { DataHubPluginOptions } from '../../types/plugin-options';
import { RuntimeConfigService } from './runtime-config.service';

describe('RuntimeConfigService', () => {
    it('loads runtime limits from plugin options during construction', () => {
        const options: DataHubPluginOptions = {
            runtime: {
                circuitBreaker: { failureThreshold: 17 },
                scheduler: {
                    refreshIntervalMs: 5_678,
                    maxPipelineDiscovery: 250,
                    maxTrackingEntries: 300,
                    maxConsecutiveFailures: 8,
                },
            },
        };
        const service = new RuntimeConfigService(options);

        expect(service.getCircuitBreakerConfig().failureThreshold).toBe(17);
        expect(service.getSchedulerConfig()).toMatchObject({
            refreshIntervalMs: 5_678,
            maxPipelineDiscovery: 250,
            maxTrackingEntries: 300,
            maxConsecutiveFailures: 8,
        });
    });

    it('uses defaults when runtime options are omitted', () => {
        const service = new RuntimeConfigService({});

        expect(service.getCircuitBreakerConfig().failureThreshold).toBeGreaterThan(0);
        expect(service.getSchedulerConfig()).toMatchObject({
            refreshIntervalMs: SCHEDULER.REFRESH_INTERVAL_MS,
            maxPipelineDiscovery: SCHEDULER.MAX_PIPELINE_DISCOVERY,
            maxTrackingEntries: SCHEDULER.MAX_TRACKING_ENTRIES,
            maxConsecutiveFailures: SCHEDULER.DEFAULT_MAX_CONSECUTIVE_FAILURES,
        });
    });

    it.each([
        ['maxPipelineDiscovery', 0],
        ['maxPipelineDiscovery', SCHEDULER.MAX_PIPELINE_DISCOVERY + 1],
        ['maxTrackingEntries', 1.5],
        ['maxTrackingEntries', SCHEDULER.MAX_TRACKING_ENTRIES + 1],
        ['maxConsecutiveFailures', SCHEDULER.MAX_CONSECUTIVE_FAILURES + 1],
    ] as const)('rejects invalid scheduler %s values', (field, value) => {
        const service = new RuntimeConfigService({
            runtime: {
                scheduler: { [field]: value },
            },
        });

        expect(() => service.getSchedulerConfig()).toThrow(
            `runtime.scheduler.${field} must be an integer between 1 and`,
        );
    });
});
