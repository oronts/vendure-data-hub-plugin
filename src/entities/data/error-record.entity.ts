import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { DeepPartial, EntityId, ID, VendureEntity } from '@vendure/core';
import type { JsonObject } from '../../types/index';
import { PipelineRun } from '../pipeline/pipeline-run.entity';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.RECORD_ERROR)
@Index(['stepKey', 'createdAt'])
@Index(['deadLetter', 'createdAt'])
@Index(['runId', 'deadLetter']) // Composite index for finding dead letters per run
@Index(['createdAt'])
export class DataHubRecordError extends VendureEntity {
    constructor(input?: DeepPartial<DataHubRecordError>) {
        super(input);
    }

    @ManyToOne(() => PipelineRun, { onDelete: 'CASCADE' })
    run!: PipelineRun;

    @Index()
    @EntityId()
    runId!: ID;

    @Column({ type: 'varchar', length: 255 })
    stepKey!: string;

    @Column({ type: 'text' })
    message!: string;

    @Column({ type: 'simple-json' })
    payload!: JsonObject;

    @Column({ type: 'boolean', default: false })
    deadLetter!: boolean;

    @Column({ type: 'text', nullable: true })
    stackTrace!: string | null;
}
