import type { ExtractorContext, JsonObject } from '../../types';

export interface ResolvedConnectionBackedConfig {
    connectionType?: string;
    config: JsonObject;
}

export async function resolveConnectionBackedConfig(
    context: ExtractorContext,
    config: JsonObject,
    supportedTypes: readonly string[],
): Promise<ResolvedConnectionBackedConfig> {
    const connectionCode = config.connectionCode;
    if (typeof connectionCode !== 'string' || connectionCode.length === 0) {
        return { config };
    }

    const connection = await context.connections.getRequired(connectionCode);
    if (!supportedTypes.includes(connection.type)) {
        throw new Error(
            `Connection "${connectionCode}" has type ${connection.type}; expected ${supportedTypes.join(' or ')}`,
        );
    }

    return {
        connectionType: connection.type,
        config: {
            ...(connection.config ?? {}),
            ...config,
        },
    };
}
