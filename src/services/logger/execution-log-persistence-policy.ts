import { LogPersistenceLevel } from '../../constants/enums';
import type { DataHubSettingsService } from '../config/settings.service';
import type { LogEventType } from './execution-logger.types';

const EVENT_LEVEL_MAP: Record<LogEventType, LogPersistenceLevel> = {
    'pipeline.start': LogPersistenceLevel.PIPELINE,
    'pipeline.complete': LogPersistenceLevel.PIPELINE,
    'pipeline.fail': LogPersistenceLevel.ERROR_ONLY,
    'step.start': LogPersistenceLevel.STEP,
    'step.complete': LogPersistenceLevel.STEP,
    'step.fail': LogPersistenceLevel.ERROR_ONLY,
    'record.error': LogPersistenceLevel.ERROR_ONLY,
    'transform.mapping': LogPersistenceLevel.DEBUG,
    'extract.source': LogPersistenceLevel.DEBUG,
    'load.target': LogPersistenceLevel.DEBUG,
    'debug': LogPersistenceLevel.DEBUG,
};

const LEVEL_HIERARCHY: Record<LogPersistenceLevel, number> = {
    [LogPersistenceLevel.ERROR_ONLY]: 1,
    [LogPersistenceLevel.PIPELINE]: 2,
    [LogPersistenceLevel.STEP]: 3,
    [LogPersistenceLevel.DEBUG]: 4,
};

const LOG_PERSISTENCE_LEVEL_CACHE_TTL_MS = 1_000;

export class ExecutionLogPersistencePolicy {
    private cachedLevel?: {
        level: LogPersistenceLevel;
        expiresAt: number;
    };
    private refreshPromise?: Promise<LogPersistenceLevel>;

    constructor(private readonly settingsService: DataHubSettingsService) {}

    async getCurrentLevel(): Promise<LogPersistenceLevel> {
        const now = Date.now();
        if (this.cachedLevel && now < this.cachedLevel.expiresAt) {
            return this.cachedLevel.level;
        }
        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        const refreshPromise = this.settingsService.getLogPersistenceLevel()
            .then(level => {
                this.cachedLevel = {
                    level,
                    expiresAt: Date.now() + LOG_PERSISTENCE_LEVEL_CACHE_TTL_MS,
                };
                return level;
            });
        this.refreshPromise = refreshPromise;
        try {
            return await refreshPromise;
        } finally {
            if (this.refreshPromise === refreshPromise) {
                this.refreshPromise = undefined;
            }
        }
    }

    shouldPersist(eventType: LogEventType, currentLevel: LogPersistenceLevel): boolean {
        const requiredLevel = EVENT_LEVEL_MAP[eventType];
        return LEVEL_HIERARCHY[currentLevel] >= LEVEL_HIERARCHY[requiredLevel];
    }

    async persist(
        eventType: LogEventType,
        write: (level: LogPersistenceLevel) => Promise<void>,
        onFailure: (error: unknown) => void,
    ): Promise<void> {
        try {
            const level = await this.getCurrentLevel();
            if (this.shouldPersist(eventType, level)) {
                await write(level);
            }
        } catch (error) {
            onFailure(error);
        }
    }
}
