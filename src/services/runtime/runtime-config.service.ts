import { Inject, Injectable } from '@nestjs/common';
import {
    CircuitBreakerConfig,
    DataHubPluginOptions,
    RuntimeLimitsConfig,
    SchedulerConfig,
} from '../../types/plugin-options';
import { DATAHUB_PLUGIN_OPTIONS } from '../../constants';
import { CIRCUIT_BREAKER, SCHEDULER } from '../../constants/defaults';

function resolveBoundedPositiveInteger(
    name: string,
    value: number | undefined,
    fallback: number,
    maximum: number,
): number {
    const resolved = value ?? fallback;
    if (!Number.isInteger(resolved) || resolved < 1 || resolved > maximum) {
        throw new Error(`${name} must be an integer between 1 and ${maximum}`);
    }
    return resolved;
}

@Injectable()
export class RuntimeConfigService {
    private readonly config: RuntimeLimitsConfig;

    constructor(
        @Inject(DATAHUB_PLUGIN_OPTIONS) options: DataHubPluginOptions,
    ) {
        this.config = options.runtime ?? {};
    }

    getCircuitBreakerConfig(): Required<CircuitBreakerConfig> {
        return {
            enabled: this.config.circuitBreaker?.enabled ?? CIRCUIT_BREAKER.ENABLED,
            failureThreshold: this.config.circuitBreaker?.failureThreshold ?? CIRCUIT_BREAKER.FAILURE_THRESHOLD,
            successThreshold: this.config.circuitBreaker?.successThreshold ?? CIRCUIT_BREAKER.SUCCESS_THRESHOLD,
            resetTimeoutMs: this.config.circuitBreaker?.resetTimeoutMs ?? CIRCUIT_BREAKER.RESET_TIMEOUT_MS,
            failureWindowMs: this.config.circuitBreaker?.failureWindowMs ?? CIRCUIT_BREAKER.FAILURE_WINDOW_MS,
        };
    }

    /**
     * Get scheduler configuration with defaults
     */
    getSchedulerConfig(): Required<SchedulerConfig> {
        return {
            checkIntervalMs: this.config.scheduler?.checkIntervalMs ?? SCHEDULER.CHECK_INTERVAL_MS,
            refreshIntervalMs: this.config.scheduler?.refreshIntervalMs ?? SCHEDULER.REFRESH_INTERVAL_MS,
            minIntervalMs: this.config.scheduler?.minIntervalMs ?? SCHEDULER.MIN_INTERVAL_MS,
            maxPipelineDiscovery: resolveBoundedPositiveInteger(
                'runtime.scheduler.maxPipelineDiscovery',
                this.config.scheduler?.maxPipelineDiscovery,
                SCHEDULER.MAX_PIPELINE_DISCOVERY,
                SCHEDULER.MAX_PIPELINE_DISCOVERY,
            ),
            maxTrackingEntries: resolveBoundedPositiveInteger(
                'runtime.scheduler.maxTrackingEntries',
                this.config.scheduler?.maxTrackingEntries,
                SCHEDULER.MAX_TRACKING_ENTRIES,
                SCHEDULER.MAX_TRACKING_ENTRIES,
            ),
            maxConsecutiveFailures: resolveBoundedPositiveInteger(
                'runtime.scheduler.maxConsecutiveFailures',
                this.config.scheduler?.maxConsecutiveFailures,
                SCHEDULER.DEFAULT_MAX_CONSECUTIVE_FAILURES,
                SCHEDULER.MAX_CONSECUTIVE_FAILURES,
            ),
        };
    }
}
