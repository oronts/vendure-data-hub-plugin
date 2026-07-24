import { Column, Entity, Index, JoinTable, ManyToMany } from 'typeorm';
import { Calculated, Channel, ChannelAware, DeepPartial, VendureEntity } from '@vendure/core';
import type { JsonObject } from '../../types/index';
import { SecretProvider } from '../../constants/enums';
import { TABLE_NAMES } from '../../constants/table-names';

@Entity(TABLE_NAMES.SECRET)
@Index(['provider'])
@Index(['code']) // Index for code lookups (unique constraint doesn't auto-create index on all DBs)
export class DataHubSecret extends VendureEntity implements ChannelAware {
    constructor(input?: DeepPartial<DataHubSecret>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 255, unique: true })
    code!: string;

    @Column({ type: 'varchar', length: 50, default: SecretProvider.INLINE })
    provider!: SecretProvider;

    @Column({ type: 'text', nullable: true })
    value!: string | null;

    @Column({ type: 'simple-json', nullable: true })
    metadata!: JsonObject | null;

    @ManyToMany(() => Channel)
    @JoinTable()
    channels!: Channel[];

    @Calculated({ expression: "(datahubsecret.value IS NOT NULL AND datahubsecret.value <> '')" })
    get hasValue(): boolean {
        return this.value !== null && this.value !== '';
    }
}
