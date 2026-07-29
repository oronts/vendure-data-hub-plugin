import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Input, Label } from '@vendure/dashboard';
import { getHttpUrlValidationError } from '../../../shared';
import { HTTP_CONNECTION_DEFAULTS } from '../../constants';
import type { HttpConnectionConfig } from '../../types';
import type { UpdateHttpConnectionConfig } from './connection-config';
import { FieldError } from './ValidationFeedback';

interface HttpConnectionBaseFieldsProps {
    config: HttpConnectionConfig;
    updateConfig: UpdateHttpConnectionConfig;
    disabled?: boolean;
}

export function HttpConnectionBaseFields({
    config,
    updateConfig,
    disabled,
}: HttpConnectionBaseFieldsProps) {
    const { t } = useLingui();
    const [urlTouched, setUrlTouched] = React.useState(false);
    const urlError = config.baseUrl.trim() !== ''
        && getHttpUrlValidationError(config.baseUrl) !== null
        ? t`Enter a valid HTTP or HTTPS URL`
        : null;

    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="connection-base-url" className="text-sm font-medium">
                    <Trans>Base URL</Trans>
                </Label>
                <Input
                    id="connection-base-url"
                    placeholder={HTTP_CONNECTION_DEFAULTS.BASE_URL_PLACEHOLDER}
                    value={config.baseUrl}
                    onChange={event => updateConfig({ baseUrl: event.target.value })}
                    onBlur={() => setUrlTouched(true)}
                    disabled={disabled}
                    className={urlError && urlTouched
                        ? 'border-destructive focus-visible:ring-destructive'
                        : ''}
                    aria-invalid={Boolean(urlError && urlTouched)}
                    aria-describedby="connection-base-url-feedback"
                />
                <div id="connection-base-url-feedback">
                    <FieldError error={urlError} touched={urlTouched} />
                </div>
                {!(urlError && urlTouched) && (
                    <p className="text-xs text-muted-foreground">
                        <Trans>Relative endpoints will be resolved against this URL.</Trans>
                    </p>
                )}
            </div>
            <div className="space-y-2">
                <Label htmlFor="connection-timeout" className="text-sm font-medium">
                    <Trans>Timeout (ms)</Trans>
                </Label>
                <Input
                    id="connection-timeout"
                    type="number"
                    min={0}
                    value={config.timeout ?? ''}
                    onChange={event => updateConfig({
                        timeout: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                    })}
                    disabled={disabled}
                />
            </div>
        </>
    );
}
