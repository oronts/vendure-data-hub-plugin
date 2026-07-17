import {
    JsonObject,
    SecretResolver,
    AdapterLogger,
    ConnectionAuthType,
} from '../../../shared/types';
import type { UIConnectionType } from '../../../shared/constants';

export { ConnectionAuthType };

export type ConnectionType = UIConnectionType;

export interface ConnectionAuth {
    readonly type: ConnectionAuthType;
    readonly secretCode?: string;
    readonly headerName?: string;
}

/**
 * Runtime connection resolved by code. Adapter-specific values live only in
 * `config`, avoiding collisions with the connection identity fields.
 */
export interface ConnectionConfig {
    readonly code: string;
    readonly type: ConnectionType;
    readonly config: JsonObject;
}

export type { SecretResolver, AdapterLogger };

export interface ConnectionResolver {
    get(code: string): Promise<ConnectionConfig | undefined>;
    getRequired(code: string): Promise<ConnectionConfig>;
}
