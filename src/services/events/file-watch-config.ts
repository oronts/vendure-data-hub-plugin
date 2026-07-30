import { FILE_WATCH } from '../../constants/defaults';
import { TriggerType } from '../../constants/enums';
import { TIME_UNITS } from '../../constants/time';
import type {
    FileWatchTriggerConfig,
    PipelineDefinition,
    TriggerConfig,
} from '../../types';

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
    if (!config.path) {
        warn(`FILE trigger missing path for pipeline ${pipelineCode}`);
        return null;
    }
    if (!config.connectionCode) {
        warn(`FILE trigger missing connectionCode for pipeline ${pipelineCode}`);
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
        pollIntervalMs: Math.max(
            config.pollIntervalMs ?? FILE_WATCH.DEFAULT_POLL_INTERVAL_MS,
            FILE_WATCH.MIN_POLL_INTERVAL_MS,
        ),
        minFileAge: config.minFileAge
            ? config.minFileAge * TIME_UNITS.SECOND
            : FILE_WATCH.DEFAULT_MIN_FILE_AGE_MS,
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
