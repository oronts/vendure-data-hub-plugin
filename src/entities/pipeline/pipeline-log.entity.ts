import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne } from 'typeorm';
import type { JsonObject } from '../../types/index';
import { LogLevel } from '../../constants/enums';
import { PipelineRun } from './pipeline-run.entity';
import { Pipeline } from './pipeline.entity';
import { TABLE_NAMES } from '../../constants/table-names';

export { LogLevel } from '../../constants/enums';

@Entity(TABLE_NAMES.PIPELINE_LOG)
@Index(['level'])
@Index(['stepKey'])
@Index(['pipelineId'])
@Index(['runId'])
@Index(['createdAt'])
@Index(['runId', 'level']) // Composite for filtering logs by level within a run
@Index(['pipelineId', 'level', 'createdAt']) // Composite for pipeline log analysis
export class PipelineLog extends VendureEntity {
    constructor(input?: DeepPartial<PipelineLog>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 10 })
    level!: LogLevel;

    @Column({ type: 'text' })
    message!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    stepKey!: string | null;

    @Column({ type: 'simple-json', nullable: true })
    context!: JsonObject | null;

    @Column({ type: 'simple-json', nullable: true })
    metadata!: JsonObject | null;

    @ManyToOne(() => Pipeline, { nullable: true, onDelete: 'CASCADE' })
    pipeline!: Pipeline | null;

    @Column({ type: 'int', nullable: true })
    pipelineId!: number | null;

    @ManyToOne(() => PipelineRun, { nullable: true, onDelete: 'CASCADE' })
    run!: PipelineRun | null;

    @Column({ type: 'int', nullable: true })
    runId!: number | null;

    @Column({ type: 'bigint', nullable: true })
    durationMs!: number | null;

    @Column({ type: 'int', nullable: true })
    recordsProcessed!: number | null;

    @Column({ type: 'int', nullable: true })
    recordsFailed!: number | null;
}
