import { Column, Entity, Index } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

/**
 * DataHubConnection entity stores external connection configurations.
 * Supports HTTP, S3, database, and other connection types.
 */
@Entity('data_hub_connection')
@Index(['code'], { unique: true })
@Index(['type'])
export class DataHubConnection extends VendureEntity {
    constructor(input?: DeepPartial<DataHubConnection>) {
        super(input);
    }

    @Column({ unique: true })
    code!: string;

    @Column({ type: 'varchar', default: 'http' })
    type!: string; // 'http' | 's3' | 'ftp' | 'db'

    @Column('simple-json')
    config!: Record<string, any>; // Connection-specific configuration
}
