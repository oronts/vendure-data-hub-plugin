import { Column, Entity, Index, JoinTable, ManyToMany } from 'typeorm';
import { Channel, ChannelAware, DeepPartial, VendureEntity } from '@vendure/core';
import type { JsonObject } from '../../types/index';
import { ConfigurationSource, ConnectionType } from '../../constants/enums';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.CONNECTION)
@Index(['type'])
export class DataHubConnection extends VendureEntity implements ChannelAware {
    constructor(input?: DeepPartial<DataHubConnection>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 255, unique: true })
    code!: string;

    @Column({ type: 'varchar', length: 50, default: ConnectionType.HTTP })
    type!: ConnectionType;

    @Column({
        type: 'varchar',
        length: 20,
        default: ConfigurationSource.DATABASE,
    })
    configurationSource!: ConfigurationSource;

    @ManyToMany(() => Channel)
    @JoinTable()
    channels!: Channel[];

    @Column({ type: 'simple-json' })
    config!: JsonObject;
}
