import { Column, Entity, Index } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';

/**
 * DataHubSecret entity stores sensitive configuration values.
 * Supports inline values, environment variables, and external secret providers.
 */
@Entity('data_hub_secret')
@Index(['code'], { unique: true })
@Index(['provider'])
export class DataHubSecret extends VendureEntity {
    constructor(input?: DeepPartial<DataHubSecret>) {
        super(input);
    }

    @Column({ unique: true })
    code!: string;

    @Column({ default: 'inline' })
    provider!: string; // 'inline' | 'env' | 'external'

    @Column({ type: 'text', nullable: true })
    value: string | null;

    @Column('simple-json', { nullable: true })
    metadata: Record<string, any> | null;
}
