import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { DeepPartial, EntityId, ID, VendureEntity } from '@vendure/core';
import type { JsonObject } from '../../types/index';
import { Pipeline } from '../pipeline/pipeline.entity';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.CHECKPOINT)
@Index(['pipelineId'], { unique: true })
export class DataHubCheckpoint extends VendureEntity {
    constructor(input?: DeepPartial<DataHubCheckpoint>) {
        super(input);
    }

    @ManyToOne(() => Pipeline, { onDelete: 'CASCADE' })
    pipeline!: Pipeline;

    @EntityId()
    pipelineId!: ID;

    @Column({ type: 'simple-json' })
    data!: JsonObject;
}
