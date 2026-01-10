import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import { PipelineRun } from '../pipeline/pipeline-run.entity';

/**
 * DataHubRecordError entity stores individual record errors during pipeline execution.
 * Supports dead letter queue patterns for failed record handling and retry.
 */
@Entity('data_hub_record_error')
@Index(['stepKey'])
@Index(['deadLetter'])
@Index(['createdAt'])
export class DataHubRecordError extends VendureEntity {
    constructor(input?: DeepPartial<DataHubRecordError>) {
        super(input);
    }

    @ManyToOne(() => PipelineRun, { onDelete: 'CASCADE' })
    run: PipelineRun;

    @Index()
    @Column({ nullable: true })
    runId: number;

    @Column()
    stepKey: string;

    @Column({ type: 'text' })
    message: string;

    @Column('simple-json')
    payload: any;

    @Column({ type: 'boolean', default: false })
    deadLetter: boolean;
}
