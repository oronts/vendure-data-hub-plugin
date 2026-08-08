import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';
import { TABLE_NAMES } from '../../constants/table-names';
import type { JsonObject } from '../../types';

@Entity(TABLE_NAMES.EXPORT_DESTINATION)
@Index(['channelId', 'destinationId'], { unique: true })
@Index(['channelId', 'type'])
@Index(['channelId', 'enabled'])
export class DataHubExportDestination extends VendureEntity {
    constructor(input?: DeepPartial<DataHubExportDestination>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 255 })
    channelId!: string;

    @Column({ type: 'varchar', length: 255 })
    destinationId!: string;

    @Column({ type: 'varchar', length: 20 })
    type!: string;

    @Column({ type: 'boolean', default: true })
    enabled!: boolean;

    @Column({ type: 'simple-json' })
    config!: JsonObject;
}
