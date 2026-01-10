import { DeepPartial, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { PipelineRun } from './pipeline-run.entity';
import { Pipeline } from './pipeline.entity';

/**
 * Log levels for pipeline execution logs.
 */
export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
}

/**
 * PipelineLog entity stores execution logs for pipeline runs.
 * Provides detailed logging with context and metadata for debugging.
 */
@Entity('data_hub_pipeline_log')
@Index(['level'])
@Index(['stepKey'])
@Index(['pipelineId'])
@Index(['runId'])
@Index(['createdAt'])
export class PipelineLog extends VendureEntity {
    constructor(input?: DeepPartial<PipelineLog>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 10 })
    level: LogLevel;

    @Column({ type: 'text' })
    message: string;

    @Column({ nullable: true })
    stepKey: string;

    @Column({ type: 'simple-json', nullable: true })
    context: Record<string, any>;

    @Column({ type: 'simple-json', nullable: true })
    metadata: Record<string, any>;

    @ManyToOne(() => Pipeline, { nullable: true, onDelete: 'CASCADE' })
    pipeline: Pipeline;

    @Column({ nullable: true })
    pipelineId: ID;

    @ManyToOne(() => PipelineRun, { nullable: true, onDelete: 'CASCADE' })
    run: PipelineRun;

    @Column({ nullable: true })
    runId: ID;

    @Column({ type: 'bigint', nullable: true })
    durationMs: number;

    @Column({ type: 'int', nullable: true })
    recordsProcessed: number;

    @Column({ type: 'int', nullable: true })
    recordsFailed: number;
}
