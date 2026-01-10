import { PipelineDefinition } from './pipeline/definition';

/**
 * Entry in a diff result showing what changed
 */
export interface DiffEntry {
    /** JSON path to the changed element: "steps.transform-1.operators[2]" */
    path: string;
    /** Human-readable label: "Transform 'normalize' → operator 'map'" */
    label: string;
    /** Type of change: step, trigger, hook, edge, config */
    type: 'step' | 'trigger' | 'hook' | 'edge' | 'config' | 'meta';
    /** Value before the change (null for additions) */
    before: unknown | null;
    /** Value after the change (null for removals) */
    after: unknown | null;
}

/**
 * Result of comparing two pipeline revisions
 */
export interface RevisionDiff {
    /** Version number of the source revision */
    fromVersion: number;
    /** Version number of the target revision */
    toVersion: number;
    /** Elements that were added */
    added: DiffEntry[];
    /** Elements that were removed */
    removed: DiffEntry[];
    /** Elements that were modified */
    modified: DiffEntry[];
    /** Count of unchanged elements */
    unchangedCount: number;
    /** Human-readable summary of changes */
    summary: string;
}

/**
 * Timeline entry combining revision info with run statistics
 */
export interface TimelineEntry {
    revision: {
        id: number;
        createdAt: Date;
        version: number;
        type: 'draft' | 'published';
        commitMessage: string | null;
        authorName: string | null;
        changesSummary: unknown;
        isLatest: boolean;
        isCurrent: boolean;
    };
    /** Number of pipeline runs using this revision */
    runCount: number;
    /** When the last run was executed */
    lastRunAt: Date | null;
    /** Status of the last run */
    lastRunStatus: 'success' | 'failed' | 'partial' | null;
}

/**
 * Options for saving a draft revision
 */
export interface SaveDraftOptions {
    pipelineId: number;
    definition: PipelineDefinition;
    authorUserId?: string;
    authorName?: string;
}

/**
 * Options for publishing a new version
 */
export interface PublishVersionOptions {
    pipelineId: number;
    commitMessage: string;
    definition?: PipelineDefinition;
    authorUserId?: string;
    authorName?: string;
}

/**
 * Options for reverting to a previous revision
 */
export interface RevertOptions {
    revisionId: number;
    commitMessage?: string;
    authorUserId?: string;
    authorName?: string;
}

/**
 * Configuration for auto-save behavior
 */
export interface AutoSaveConfig {
    /** Whether auto-save is enabled */
    enabled: boolean;
    /** Minimum time between saves in ms */
    throttleMs: number;
    /** Maximum number of drafts to keep per pipeline */
    maxDraftsToKeep: number;
    /** Whether to prune drafts when publishing */
    pruneOnPublish: boolean;
    /** Maximum age of drafts to keep (days) */
    maxDraftAgeDays: number;
}

/**
 * Default auto-save configuration
 */
export const DEFAULT_AUTO_SAVE_CONFIG: AutoSaveConfig = {
    enabled: true,
    throttleMs: 30000,
    maxDraftsToKeep: 10,
    pruneOnPublish: true,
    maxDraftAgeDays: 7,
};
