import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button, Input, Label } from '@vendure/dashboard';
import { ConnectionAuthType } from '../../../shared/types';
import { PLACEHOLDERS } from '../../constants';
import { useOptionValues } from '../../hooks/api/use-config-options';
import type { HttpConnectionConfig } from '../../types';
import {
    filterSupportedConnectionAuthOptions,
    isSupportedConnectionAuthType,
} from '../../utils/connection-auth';
import type { UpdateHttpConnectionConfig } from './connection-config';
import { SecretReferenceInput } from './SecretReferenceInput';

interface HttpAuthenticationFieldsProps {
    auth?: HttpConnectionConfig['auth'];
    updateConfig: UpdateHttpConnectionConfig;
    disabled?: boolean;
}

const AUTH_FIELD_IDS = {
    BEARER_SECRET: 'connection-auth-bearer-secret',
    BEARER_HELP: 'connection-auth-bearer-help',
    API_KEY_HEADER: 'connection-auth-api-key-header',
    API_KEY_SECRET: 'connection-auth-api-key-secret',
    BASIC_USERNAME_SOURCE: 'connection-auth-basic-username-source',
    BASIC_USERNAME: 'connection-auth-basic-username',
    BASIC_PASSWORD: 'connection-auth-basic-password',
} as const;

export function HttpAuthenticationFields({
    auth = { type: ConnectionAuthType.NONE },
    updateConfig,
    disabled,
}: HttpAuthenticationFieldsProps) {
    const { t } = useLingui();
    const authOptions = useAuthOptions();
    const updateAuth = (
        patch: Partial<NonNullable<HttpConnectionConfig['auth']>>,
    ) => {
        const nextAuth: Record<string, unknown> = { ...auth, ...patch };
        for (const [key, value] of Object.entries(nextAuth)) {
            if (value === undefined || value === '') delete nextAuth[key];
        }
        updateConfig({ auth: nextAuth as HttpConnectionConfig['auth'] });
    };
    const changeAuthType = (type: ConnectionAuthType) => {
        updateConfig({ auth: { type } });
    };

    return (
        <div className="space-y-3" role="group" aria-labelledby="authentication-label">
            <Label id="authentication-label" className="text-sm font-medium">
                <Trans>Authentication</Trans>
            </Label>
            <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label={t`Select authentication method`}
            >
                {authOptions.map(option => (
                    <Button
                        key={option.value}
                        type="button"
                        variant={auth.type === option.value ? 'default' : 'outline'}
                        onClick={() => changeAuthType(option.value)}
                        disabled={disabled}
                        role="radio"
                        aria-checked={auth.type === option.value}
                    >
                        {option.label}
                    </Button>
                ))}
            </div>
            {!isSupportedConnectionAuthType(auth.type) && (
                <p className="text-sm text-destructive" role="alert">
                    {t`Unsupported authentication type: ${String(auth.type)}`}
                </p>
            )}
            <AuthenticationCredentials
                auth={auth}
                updateAuth={updateAuth}
                disabled={disabled}
            />
        </div>
    );
}

function AuthenticationCredentials({
    auth,
    updateAuth,
    disabled,
}: {
    auth: NonNullable<HttpConnectionConfig['auth']>;
    updateAuth: (
        patch: Partial<NonNullable<HttpConnectionConfig['auth']>>,
    ) => void;
    disabled?: boolean;
}) {
    switch (auth.type) {
        case ConnectionAuthType.BEARER:
            return (
                <BearerCredentials
                    secretCode={auth.secretCode}
                    onChange={value => updateAuth({ secretCode: value })}
                    disabled={disabled}
                />
            );
        case ConnectionAuthType.API_KEY:
            return (
                <ApiKeyCredentials
                    headerName={auth.headerName}
                    secretCode={auth.secretCode}
                    updateAuth={updateAuth}
                    disabled={disabled}
                />
            );
        case ConnectionAuthType.BASIC:
            return (
                <BasicCredentials
                    username={auth.username}
                    usernameSecretCode={auth.usernameSecretCode}
                    secretCode={auth.secretCode}
                    updateAuth={updateAuth}
                    disabled={disabled}
                />
            );
        default:
            return null;
    }
}

function BearerCredentials({
    secretCode,
    onChange,
    disabled,
}: {
    secretCode?: string;
    onChange: (value?: string) => void;
    disabled?: boolean;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={AUTH_FIELD_IDS.BEARER_SECRET} className="text-sm font-medium">
                <Trans>Secret Code</Trans>
            </Label>
            <SecretReferenceInput
                id={AUTH_FIELD_IDS.BEARER_SECRET}
                value={secretCode ?? ''}
                onChange={onChange}
                placeholder={PLACEHOLDERS.BEARER_TOKEN}
                disabled={disabled}
                aria-describedby={AUTH_FIELD_IDS.BEARER_HELP}
            />
            <p id={AUTH_FIELD_IDS.BEARER_HELP} className="text-xs text-muted-foreground">
                <Trans>Token will be sent as a Bearer Authorization header.</Trans>
            </p>
        </div>
    );
}

function ApiKeyCredentials({
    headerName,
    secretCode,
    updateAuth,
    disabled,
}: {
    headerName?: string;
    secretCode?: string;
    updateAuth: (
        patch: Partial<NonNullable<HttpConnectionConfig['auth']>>,
    ) => void;
    disabled?: boolean;
}) {
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor={AUTH_FIELD_IDS.API_KEY_HEADER} className="text-sm font-medium">
                    <Trans>Header Name</Trans>
                </Label>
                <Input
                    id={AUTH_FIELD_IDS.API_KEY_HEADER}
                    placeholder={PLACEHOLDERS.API_KEY_HEADER}
                    value={headerName ?? ''}
                    onChange={event => updateAuth({ headerName: event.target.value })}
                    disabled={disabled}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor={AUTH_FIELD_IDS.API_KEY_SECRET} className="text-sm font-medium">
                    <Trans>Secret Code</Trans>
                </Label>
                <SecretReferenceInput
                    id={AUTH_FIELD_IDS.API_KEY_SECRET}
                    value={secretCode ?? ''}
                    onChange={value => updateAuth({ secretCode: value })}
                    placeholder={PLACEHOLDERS.API_KEY_SECRET}
                    disabled={disabled}
                />
            </div>
        </div>
    );
}

function BasicCredentials({
    username,
    usernameSecretCode,
    secretCode,
    updateAuth,
    disabled,
}: {
    username?: string;
    usernameSecretCode?: string;
    secretCode?: string;
    updateAuth: (
        patch: Partial<NonNullable<HttpConnectionConfig['auth']>>,
    ) => void;
    disabled?: boolean;
}) {
    const { t } = useLingui();
    const [usernameMode, setUsernameMode] = React.useState<'LITERAL' | 'SECRET'>(
        usernameSecretCode ? 'SECRET' : 'LITERAL',
    );
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label id={AUTH_FIELD_IDS.BASIC_USERNAME_SOURCE} className="text-sm font-medium">
                    <Trans>Username source</Trans>
                </Label>
                <div
                    className="flex flex-wrap gap-2"
                    role="radiogroup"
                    aria-labelledby={AUTH_FIELD_IDS.BASIC_USERNAME_SOURCE}
                >
                    <Button
                        type="button"
                        variant={usernameMode === 'LITERAL' ? 'default' : 'outline'}
                        onClick={() => {
                            setUsernameMode('LITERAL');
                            updateAuth({
                                usernameSecretCode: undefined,
                                username: username ?? '',
                            });
                        }}
                        disabled={disabled}
                        role="radio"
                        aria-checked={usernameMode === 'LITERAL'}
                    >
                        <Trans>Username</Trans>
                    </Button>
                    <Button
                        type="button"
                        variant={usernameMode === 'SECRET' ? 'default' : 'outline'}
                        onClick={() => {
                            setUsernameMode('SECRET');
                            updateAuth({
                                username: undefined,
                                usernameSecretCode: usernameSecretCode ?? '',
                            });
                        }}
                        disabled={disabled}
                        role="radio"
                        aria-checked={usernameMode === 'SECRET'}
                    >
                        <Trans>Username Secret Code</Trans>
                    </Button>
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor={AUTH_FIELD_IDS.BASIC_USERNAME} className="text-sm font-medium">
                    {usernameMode === 'SECRET' ? t`Username Secret Code` : t`Username`}
                </Label>
                {usernameMode === 'SECRET' ? (
                    <SecretReferenceInput
                        id={AUTH_FIELD_IDS.BASIC_USERNAME}
                        value={usernameSecretCode ?? ''}
                        onChange={value => updateAuth({
                            username: undefined,
                            usernameSecretCode: value,
                        })}
                        disabled={disabled}
                    />
                ) : (
                    <Input
                        id={AUTH_FIELD_IDS.BASIC_USERNAME}
                        placeholder={PLACEHOLDERS.SERVICE_USER}
                        value={username ?? ''}
                        onChange={event => updateAuth({
                            username: event.target.value,
                            usernameSecretCode: undefined,
                        })}
                        disabled={disabled}
                    />
                )}
            </div>
            <div className="space-y-2">
                <Label htmlFor={AUTH_FIELD_IDS.BASIC_PASSWORD} className="text-sm font-medium">
                    <Trans>Password Secret Code</Trans>
                </Label>
                <SecretReferenceInput
                    id={AUTH_FIELD_IDS.BASIC_PASSWORD}
                    value={secretCode ?? ''}
                    onChange={value => updateAuth({ secretCode: value })}
                    placeholder={PLACEHOLDERS.PASSWORD_SECRET}
                    disabled={disabled}
                />
            </div>
        </div>
    );
}

function useAuthOptions(): Array<{ value: ConnectionAuthType; label: string }> {
    const { t } = useLingui();
    const { options: backendOptions } = useOptionValues('authTypes');
    const supportedOptions = filterSupportedConnectionAuthOptions(backendOptions);
    if (supportedOptions.length > 0) {
        return supportedOptions.map(option => ({
            value: option.value as ConnectionAuthType,
            label: option.label,
        }));
    }
    return [
        {
            value: ConnectionAuthType.NONE,
            label: t`None`,
        },
        {
            value: ConnectionAuthType.BASIC,
            label: t`Basic`,
        },
        {
            value: ConnectionAuthType.BEARER,
            label: t`Bearer Token`,
        },
        {
            value: ConnectionAuthType.API_KEY,
            label: t`API Key`,
        },
    ];
}
