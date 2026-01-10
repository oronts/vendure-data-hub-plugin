import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import { Pipeline } from './pipeline.entity';
import { PipelineDefinition } from '../../types/index';

/**
 * Summary of changes between revisions (auto-computed on save)
 */
export interface RevisionChangesSummary {
    /** Step keys that were added */
    stepsAdded: string[];
    /** Step keys that were removed */
    stepsRemoved: string[];
    /** Step keys that were modified */
    stepsModified: string[];
    /** Whether triggers were changed */
    triggersChanged: boolean;
    /** Whether hooks were changed */
    hooksChanged: boolean;
    /** Number of configuration changes */
    configChanges: number;
    /** Total number of changes */
    totalChanges: number;
}

/**
 * Type of revision - draft (auto-save) or published (explicit save with message)
 */
export type RevisionType = 'draft' | 'published';

/**
 * PipelineRevision entity stores historical versions of pipeline definitions.
 * Enables version tracking, diff comparison, and rollback capabilities.
 *
 * Two types of revisions:
 * - 'draft': Auto-saved changes (throttled, no commit message)
 * - 'published': Explicit version with commit message (user action)
 */
@Entity('data_hub_pipeline_revision')
@Index(['pipelineId', 'version'])
@Index(['pipelineId', 'type'])
@Index(['pipelineId', 'createdAt'])
@Index(['type'])
export class PipelineRevision extends VendureEntity {
    constructor(input?: DeepPartial<PipelineRevision>) {
        super(input);
    }

    @ManyToOne(() => Pipeline, { onDelete: 'CASCADE' })
    pipeline!: Pipeline;

    @Index()
    @Column({ type: 'int', nullable: true })
    pipelineId: number;

    /**
     * Version number - sequential for published revisions only.
     * Drafts use 0 and rely on createdAt for ordering.
     */
    @Column({ default: 0 })
    version!: number;

    /**
     * The complete pipeline definition at this revision
     */
    @Column('simple-json')
    definition!: PipelineDefinition;

    /**
     * Type of revision: 'draft' for auto-saves, 'published' for explicit versions
     */
    @Column({ type: 'varchar', length: 20, default: 'draft' })
    type!: RevisionType;

    /**
     * User-provided description of changes (required for published, null for draft)
     */
    @Column({ type: 'varchar', length: 500, nullable: true })
    commitMessage: string | null;

    /**
     * ID of the user who created this revision
     */
    @Column({ type: 'varchar', nullable: true })
    authorUserId: string | null;

    /**
     * Display name of the author (denormalized for efficient display)
     */
    @Column({ type: 'varchar', length: 255, nullable: true })
    authorName: string | null;

    /**
     * Auto-computed summary of changes from the previous revision
     */
    @Column({ type: 'simple-json', nullable: true })
    changesSummary: RevisionChangesSummary | null;

    /**
     * Reference to the previous revision for diff computation
     */
    @Column({ type: 'int', nullable: true })
    previousRevisionId: number | null;

    /**
     * Size of the definition in bytes (for storage analytics)
     */
    @Column({ type: 'int', default: 0 })
    definitionSize!: number;

    /**
     * Hash of the definition for quick change detection
     */
    @Column({ type: 'varchar', length: 64, nullable: true })
    definitionHash: string | null;
}
