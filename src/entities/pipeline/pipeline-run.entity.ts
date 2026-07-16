import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { DeepPartial, EntityId, ID, VendureEntity } from '@vendure/core';
import { Pipeline } from './pipeline.entity';
import { PipelineCheckpoint, PipelineDefinition, PipelineMetrics } from '../../types/index';
import { RunStatus } from '../../constants/enums';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.PIPELINE_RUN)
@Index(['pipelineId', 'createdAt'])
@Index(['status', 'createdAt'])
@Index(['pipelineId', 'status']) // Composite for pipeline-specific status queries
@Index(['startedAt']) // For sorting by execution time
@Index(
    ['idempotencyChannelId', 'pipelineId', 'idempotencyTriggerKeyHash', 'idempotencyKeyHash'],
    { unique: true },
)
export class PipelineRun extends VendureEntity {
    constructor(input?: DeepPartial<PipelineRun>) {
        super(input);
    }

    @ManyToOne(() => Pipeline, { onDelete: 'CASCADE' })
    pipeline!: Pipeline;

    @Index()
    @EntityId()
    pipelineId!: ID;

    @Column({ type: 'varchar', length: 20 })
    status!: RunStatus;

    @Column({ type: Date, nullable: true })
    startedAt!: Date | null;

    @Column({ type: Date, nullable: true })
    finishedAt!: Date | null;

    @Column({ type: 'simple-json', nullable: true })
    metrics!: PipelineMetrics | null;

    @Column({ type: 'text', nullable: true })
    error!: string | null;

    @Column({ type: 'simple-json', nullable: true })
    definitionSnapshot!: PipelineDefinition | null;

    @Column({ type: 'simple-json', nullable: true })
    checkpoint!: PipelineCheckpoint | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    startedByUserId!: string | null;

    @Index()
    @Column({ type: 'varchar', length: 255, nullable: true })
    triggeredBy!: string | null;


    @Column({ type: 'varchar', length: 255, nullable: true })
    idempotencyChannelId!: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    idempotencyTriggerKeyHash!: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    idempotencyKeyHash!: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    idempotencyPayloadHash!: string | null;

    @Column({ type: Date, nullable: true })
    idempotencyExpiresAt!: Date | null;
    /** Virtual alias for `finishedAt` - exposed on the GraphQL type as `completedAt` */
    get completedAt(): Date | null {
        return this.finishedAt;
    }

    /** Virtual alias for `error` - exposed on the GraphQL type as `errorMessage` */
    get errorMessage(): string | null {
        return this.error;
    }
}
