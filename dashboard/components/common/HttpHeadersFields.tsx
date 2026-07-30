import { useLingui } from '@lingui/react/macro';
import { HeadersEditor } from './HeadersEditor';
import type { UpdateHttpConnectionConfig } from './connection-config';

interface HttpHeadersFieldsProps {
    readonly headers?: Record<string, string>;
    readonly updateConfig: UpdateHttpConnectionConfig;
    readonly disabled?: boolean;
}

export function HttpHeadersFields({
    headers,
    updateConfig,
    disabled,
}: HttpHeadersFieldsProps) {
    const { t } = useLingui();

    return (
        <HeadersEditor
            headers={headers ?? {}}
            onChange={nextHeaders => updateConfig({
                headers: Object.keys(nextHeaders).length > 0
                    ? nextHeaders
                    : undefined,
            })}
            label={t`Default Headers`}
            description={t`Headers sent with every request.`}
            emptyMessage={t`No headers configured.`}
            placeholder={t`Header Value`}
            disabled={disabled}
        />
    );
}
