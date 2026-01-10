import { Column, Entity, Index } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import { PipelineDefinition } from '../../types/index';

/**
 * Pipeline entity represents a data processing pipeline configuration.
 * Contains the pipeline definition, versioning, and publication state.
 */
@Entity('data_hub_pipeline')
@Index(['code'], { unique: true })
@Index(['status'])
@Index(['enabled'])
export class Pipeline extends VendureEntity {
    constructor(input?: DeepPartial<Pipeline>) {
        super(input);
    }

    @Column({ unique: true })
    code: string;

    @Column()
    name: string;

    @Column({ default: true })
    enabled: boolean;

    /**
     * Current published version number (incremented on each publish)
     */
    @Column({ default: 1 })
    version: number;

    /**
     * The active pipeline definition (current working copy)
     */
    @Column('simple-json')
    definition: PipelineDefinition;

    @Column({ type: 'varchar', default: 'DRAFT' })
    status: 'DRAFT' | 'PUBLISHED';

    @Column({ type: 'datetime', nullable: true })
    publishedAt: Date | null;

    @Column({ type: 'varchar', nullable: true })
    publishedByUserId: string | null;

    /**
     * Reference to the currently active published revision
     */
    @Column({ type: 'int', nullable: true })
    currentRevisionId: number | null;

    /**
     * Reference to the latest draft revision (for auto-save)
     */
    @Column({ type: 'int', nullable: true })
    draftRevisionId: number | null;

    /**
     * Total count of published versions (for version numbering)
     */
    @Column({ type: 'int', default: 0 })
    publishedVersionCount: number;
}
