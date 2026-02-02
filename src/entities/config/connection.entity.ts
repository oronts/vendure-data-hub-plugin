import { Column, Entity, Index } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import type { JsonObject } from '../../types/index';
import { ConnectionType } from '../../constants/enums';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.CONNECTION)
@Index(['type'])
@Index(['code']) // Index for code lookups (unique constraint doesn't auto-create index on all DBs)
export class DataHubConnection extends VendureEntity {
    constructor(input?: DeepPartial<DataHubConnection>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 255, unique: true })
    code!: string;

    @Column({ type: 'varchar', length: 50, default: ConnectionType.HTTP })
    type!: ConnectionType;

    @Column({ type: 'simple-json' })
    config!: JsonObject;
}
