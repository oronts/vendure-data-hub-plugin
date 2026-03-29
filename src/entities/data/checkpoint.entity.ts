import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import type { JsonObject } from '../../types/index';
import { Pipeline } from '../pipeline/pipeline.entity';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.CHECKPOINT)
@Index(['pipelineId', 'createdAt'])
export class DataHubCheckpoint extends VendureEntity {
    constructor(input?: DeepPartial<DataHubCheckpoint>) {
        super(input);
    }

    @ManyToOne(() => Pipeline, { onDelete: 'CASCADE' })
    pipeline!: Pipeline;

    @Index()
    @Column({ type: 'int' })
    pipelineId!: number;

    @Column({ type: 'simple-json' })
    data!: JsonObject;
}
