import { Column, Entity, Index } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import type {
    JsonObject,
    SchemaCompatibility,
} from '../../types';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.SCHEMA)
@Index(['schemaId', 'version'], { unique: true })
@Index(['schemaId'])
export class DataHubSchema extends VendureEntity {
    constructor(input?: DeepPartial<DataHubSchema>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 255 })
    schemaId!: string;

    @Column({ type: 'varchar', length: 100 })
    version!: string;

    @Column({ type: 'varchar', length: 20 })
    compatibility!: SchemaCompatibility;

    @Column({ type: 'simple-json' })
    definition!: JsonObject;

    @Column({ type: 'simple-json', nullable: true })
    metadata!: JsonObject | null;
}
