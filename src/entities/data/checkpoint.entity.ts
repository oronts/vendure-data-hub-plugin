import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import { Pipeline } from '../pipeline/pipeline.entity';

/**
 * PipelineCheckpointEntity stores checkpoint data for resumable pipeline execution.
 * Enables pipelines to resume from the last successful checkpoint after failures.
 */
@Entity('data_hub_checkpoint')
export class PipelineCheckpointEntity extends VendureEntity {
    constructor(input?: DeepPartial<PipelineCheckpointEntity>) {
        super(input);
    }

    @ManyToOne(() => Pipeline, { onDelete: 'CASCADE' })
    pipeline: Pipeline;

    @Index()
    @Column({ nullable: true })
    pipelineId: number;

    @Column('simple-json')
    data: Record<string, any>;
}
