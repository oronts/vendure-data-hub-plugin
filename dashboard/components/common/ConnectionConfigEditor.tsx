import { Trans } from '@lingui/react/macro';
import { CONNECTION_TYPE } from '../../constants';
import { useConnectionSchemas } from '../../hooks/api/use-config-options';
import type { UIConnectionType } from '../../types';
import {
    createDefaultConnectionConfig,
    isHttpLikeConnectionType,
    normalizeConnectionConfig,
    resolveConnectionSchema,
} from './connection-config';
import { ConnectionSchemaFields } from './ConnectionSchemaFields';
import { HttpConnectionFields } from './HttpConnectionFields';

export interface ConnectionConfigEditorProps {
    type: UIConnectionType;
    config: Record<string, unknown>;
    onChange: (config: Record<string, unknown>) => void;
    disabled?: boolean;
}

export function ConnectionConfigEditor({
    type,
    config,
    onChange,
    disabled,
}: ConnectionConfigEditorProps) {
    const resolvedType = (
        typeof type === 'string' && type.length > 0
            ? type
            : CONNECTION_TYPE.HTTP
    ) as UIConnectionType;
    const { schemas } = useConnectionSchemas();
    const isHttpLike = isHttpLikeConnectionType(resolvedType, schemas);

    if (isHttpLike) {
        return (
            <HttpConnectionFields
                config={config}
                onChange={onChange}
                disabled={disabled}
            />
        );
    }

    const schema = resolveConnectionSchema(resolvedType, schemas);
    if (schema.length === 0) {
        return (
            <div className="text-center py-4 text-muted-foreground">
                <Trans>No configuration options available for this type.</Trans>
            </div>
        );
    }
    return (
        <ConnectionSchemaFields
            schema={schema}
            config={config}
            onChange={onChange}
            disabled={disabled}
        />
    );
}

export {
    createDefaultConnectionConfig,
    normalizeConnectionConfig,
};
