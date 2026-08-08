import * as React from 'react';
import type { HttpConnectionConfig } from '../../types';
import { normalizeHttpConfig } from './connection-config';
import { HttpAuthenticationFields } from './HttpAuthenticationFields';
import { HttpConnectionBaseFields } from './HttpConnectionBaseFields';
import { HttpHeadersFields } from './HttpHeadersFields';

interface HttpConnectionFieldsProps {
    config: Record<string, unknown>;
    onChange: (config: Record<string, unknown>) => void;
    disabled?: boolean;
}

export function HttpConnectionFields({
    config,
    onChange,
    disabled,
}: HttpConnectionFieldsProps) {
    const normalized = React.useMemo(() => normalizeHttpConfig(config), [config]);
    const updateConfig = (patch: Partial<HttpConnectionConfig>) => {
        onChange({ ...normalized, ...patch });
    };

    return (
        <div className="space-y-6">
            <HttpConnectionBaseFields
                config={normalized}
                updateConfig={updateConfig}
                disabled={disabled}
            />
            <HttpHeadersFields
                headers={normalized.headers}
                updateConfig={updateConfig}
                disabled={disabled}
            />
            <HttpAuthenticationFields
                auth={normalized.auth}
                updateConfig={updateConfig}
                disabled={disabled}
            />
        </div>
    );
}
