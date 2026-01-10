import { Injectable } from '@nestjs/common';
import {
    RuntimeLimitsConfig,
    BatchConfig,
    HttpConfig,
    CircuitBreakerConfig,
    ConnectionPoolConfig,
    RuntimePaginationConfig,
    SchedulerConfig,
    EventTriggerServiceConfig,
} from '../../types/plugin-options';
import { BATCH, HTTP, PAGINATION, CONNECTION_POOL, CIRCUIT_BREAKER, SCHEDULER } from '../../constants/defaults';

@Injectable()
export class RuntimeConfigService {
    private config: RuntimeLimitsConfig = {};

    initialize(config?: RuntimeLimitsConfig): void {
        this.config = config ?? {};
    }

    getBatchConfig(): Required<BatchConfig> {
        return {
            size: this.config.batch?.size ?? BATCH.SIZE,
            bulkSize: this.config.batch?.bulkSize ?? BATCH.BULK_SIZE,
            maxInFlight: this.config.batch?.maxInFlight ?? BATCH.MAX_IN_FLIGHT,
            rateLimitRps: this.config.batch?.rateLimitRps ?? BATCH.RATE_LIMIT_RPS,
        };
    }

    getHttpConfig(): Required<HttpConfig> {
        return {
            timeoutMs: this.config.http?.timeoutMs ?? HTTP.TIMEOUT_MS,
            maxRetries: this.config.http?.maxRetries ?? HTTP.MAX_RETRIES,
            retryDelayMs: this.config.http?.retryDelayMs ?? HTTP.RETRY_DELAY_MS,
            retryMaxDelayMs: this.config.http?.retryMaxDelayMs ?? HTTP.RETRY_MAX_DELAY_MS,
            exponentialBackoff: this.config.http?.exponentialBackoff ?? HTTP.EXPONENTIAL_BACKOFF,
            backoffMultiplier: this.config.http?.backoffMultiplier ?? HTTP.BACKOFF_MULTIPLIER,
        };
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

    getConnectionPoolConfig(): Required<ConnectionPoolConfig> {
        return {
            min: this.config.connectionPool?.min ?? CONNECTION_POOL.MIN,
            max: this.config.connectionPool?.max ?? CONNECTION_POOL.MAX,
            idleTimeoutMs: this.config.connectionPool?.idleTimeoutMs ?? CONNECTION_POOL.IDLE_TIMEOUT_MS,
            acquireTimeoutMs: this.config.connectionPool?.acquireTimeoutMs ?? CONNECTION_POOL.ACQUIRE_TIMEOUT_MS,
        };
    }

    getPaginationConfig(): Required<RuntimePaginationConfig> {
        return {
            maxPages: this.config.pagination?.maxPages ?? PAGINATION.MAX_PAGES,
            pageSize: this.config.pagination?.pageSize ?? PAGINATION.PAGE_SIZE,
            databasePageSize: this.config.pagination?.databasePageSize ?? PAGINATION.DATABASE_PAGE_SIZE,
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
        };
    }

    /**
     * Get event trigger service configuration with defaults
     */
    getEventTriggerConfig(): Required<EventTriggerServiceConfig> {
        return {
            cacheRefreshIntervalMs: this.config.eventTrigger?.cacheRefreshIntervalMs ?? SCHEDULER.REFRESH_INTERVAL_MS,
        };
    }

    getRawConfig(): RuntimeLimitsConfig {
        return this.config;
    }
}
