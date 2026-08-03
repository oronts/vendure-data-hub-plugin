import { FILE_WATCH } from '../../constants/defaults';
import { TriggerType } from '../../constants/enums';
import { TIME_UNITS } from '../../constants/time';
import type {
    FileWatchTriggerConfig,
    PipelineDefinition,
    TriggerConfig,
} from '../../types';

function isBoundedInteger(
    value: unknown,
    minimum: number,
    maximum: number,
): value is number {
    return typeof value === 'number'
        && Number.isSafeInteger(value)
        && value >= minimum
        && value <= maximum;
}

export interface FileWatcherConfig {
    pipelineId: string;
    pipelineCode: string;
    revisionId: string;
    triggerKey: string;
    connectionCode: string;
    path: string;
    pattern?: string;
    pollIntervalMs: number;
    minFileAge: number;
    recursive: boolean;
    autoStart: boolean;
}

export function findEnabledFileTriggers(
    definition: PipelineDefinition,
): Array<{
    triggerKey: string;
    config: FileWatchTriggerConfig;
}> {
    const triggers: Array<{
        triggerKey: string;
        config: FileWatchTriggerConfig;
    }> = [];

    for (const step of definition.steps) {
        if (step.type !== 'TRIGGER') continue;

        const triggerConfig = step.config as unknown as TriggerConfig | undefined;
        if (
            triggerConfig?.enabled !== false
            && triggerConfig?.type === TriggerType.FILE
            && triggerConfig.fileWatch
        ) {
            triggers.push({
                triggerKey: step.key,
                config: triggerConfig.fileWatch,
            });
        }
    }

    return triggers;
}

export function buildFileWatcherConfig(
    pipelineId: string,
    pipelineCode: string,
    revisionId: string,
    triggerKey: string,
    config: FileWatchTriggerConfig,
    warn: (message: string) => void,
): FileWatcherConfig | null {
    if (typeof config.path !== 'string' || config.path.trim().length === 0) {
        warn(`FILE trigger missing path for pipeline ${pipelineCode}`);
        return null;
    }
    if (
        typeof config.connectionCode !== 'string'
        || config.connectionCode.trim().length === 0
    ) {
        warn(`FILE trigger missing connectionCode for pipeline ${pipelineCode}`);
        return null;
    }
    if (
        config.pattern !== undefined
        && (
            typeof config.pattern !== 'string'
            || config.pattern.trim().length === 0
        )
    ) {
        warn(`FILE trigger pattern must be a non-empty string for pipeline ${pipelineCode}`);
        return null;
    }
    if (
        config.recursive !== undefined
        && typeof config.recursive !== 'boolean'
    ) {
        warn(`FILE trigger recursive must be a boolean for pipeline ${pipelineCode}`);
        return null;
    }

    const pollIntervalMs = config.pollIntervalMs
        ?? FILE_WATCH.DEFAULT_POLL_INTERVAL_MS;
    if (!isBoundedInteger(
        pollIntervalMs,
        FILE_WATCH.MIN_POLL_INTERVAL_MS,
        FILE_WATCH.MAX_POLL_INTERVAL_MS,
    )) {
        warn(
            `FILE trigger pollIntervalMs must be an integer from ${FILE_WATCH.MIN_POLL_INTERVAL_MS} to ${FILE_WATCH.MAX_POLL_INTERVAL_MS} for pipeline ${pipelineCode}`,
        );
        return null;
    }

    const minFileAgeSec = config.minFileAge
        ?? FILE_WATCH.DEFAULT_MIN_FILE_AGE_SEC;
    if (!isBoundedInteger(
        minFileAgeSec,
        FILE_WATCH.MIN_FILE_AGE_SEC,
        FILE_WATCH.MAX_FILE_AGE_SEC,
    )) {
        warn(
            `FILE trigger minFileAge must be an integer from ${FILE_WATCH.MIN_FILE_AGE_SEC} to ${FILE_WATCH.MAX_FILE_AGE_SEC} seconds for pipeline ${pipelineCode}`,
        );
        return null;
    }

    return {
        pipelineId,
        pipelineCode,
        revisionId,
        triggerKey,
        connectionCode: config.connectionCode,
        path: config.path,
        pattern: config.pattern,
        pollIntervalMs,
        minFileAge: minFileAgeSec * TIME_UNITS.SECOND,
        recursive: config.recursive ?? true,
        autoStart: true,
    };
}

export function getFileWatcherKey(
    pipelineCode: string,
    triggerKey: string,
): string {
    return `${pipelineCode}:${triggerKey}`;
}

export function fileWatcherConfigsEqual(
    current: FileWatcherConfig,
    next: FileWatcherConfig,
): boolean {
    return current.pipelineId === next.pipelineId
        && current.revisionId === next.revisionId
        && current.connectionCode === next.connectionCode
        && current.path === next.path
        && current.pattern === next.pattern
        && current.pollIntervalMs === next.pollIntervalMs
        && current.minFileAge === next.minFileAge
        && current.recursive === next.recursive
        && current.autoStart === next.autoStart;
}
