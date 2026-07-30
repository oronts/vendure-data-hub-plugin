import type { ReactNode } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { AlertCircle } from 'lucide-react';
import {
    SECRET_PROVIDER,
    SECRET_PROVIDER_TRANSLATION_IDS,
} from '../../constants';

type SecretProvider = typeof SECRET_PROVIDER[keyof typeof SECRET_PROVIDER];

interface SecretStatusNoticesProps {
    readonly isOverridden: boolean;
    readonly valueStatus?: string | null;
    readonly securityMode?: string | null;
}

export function SecretStatusNotices({
    isOverridden,
    valueStatus,
    securityMode,
}: SecretStatusNoticesProps) {
    return (
        <>
            {isOverridden && (
                <SecretNotice tone="warning" title={<Trans>Overridden by code-first configuration</Trans>}>
                    <Trans>Runtime resolution uses the in-memory definition with this code. This database row cannot be updated; delete it before removing the code-first definition to prevent an unencrypted credential from becoming active.</Trans>
                </SecretNotice>
            )}
            {valueStatus === 'UNENCRYPTED' && (
                <SecretNotice tone="danger" title={<Trans>Unencrypted inline value</Trans>}>
                    <Trans>Strict runtime resolution rejects this value. Enter a replacement while the correct master key is configured to store it encrypted.</Trans>
                </SecretNotice>
            )}
            {securityMode === 'STRICT_DISABLED' && (
                <SecretNotice tone="neutral">
                    <Trans>Inline storage is disabled until DATAHUB_MASTER_KEY is configured. Use an environment variable reference.</Trans>
                </SecretNotice>
            )}
        </>
    );
}

interface SecretValueNoticesProps {
    readonly provider: SecretProvider;
    readonly hasStoredValue: boolean;
    readonly hasReplacement: boolean;
    readonly clearScheduled: boolean;
    readonly providerChanged: boolean;
}

export function SecretValueNotices({
    provider,
    hasStoredValue,
    hasReplacement,
    clearScheduled,
    providerChanged,
}: SecretValueNoticesProps) {
    const { i18n } = useLingui();
    return (
        <>
            {clearScheduled && (
                <SecretNotice tone="danger" title={<Trans>Stored value will be cleared</Trans>}>
                    <Trans>Select Undo clear to retain it, or update the secret to apply the removal.</Trans>
                </SecretNotice>
            )}
            {hasStoredValue && !hasReplacement && !clearScheduled && !providerChanged && (
                <SecretNotice tone="neutral" title={<Trans>Existing value retained</Trans>}>
                    <Trans>Enter a replacement to change it, or leave this field blank to keep the current value.</Trans>
                </SecretNotice>
            )}
            {provider === SECRET_PROVIDER.ENV && (
                <SecretNotice
                    tone="neutral"
                    title={i18n._(SECRET_PROVIDER_TRANSLATION_IDS.ENV)}
                >
                    <Trans>The value will be read from the server environment at runtime. Make sure the variable is set in your deployment environment.</Trans>
                </SecretNotice>
            )}
        </>
    );
}

interface SecretNoticeProps {
    readonly tone: 'warning' | 'danger' | 'neutral';
    readonly title?: ReactNode;
    readonly children: ReactNode;
}

function SecretNotice({ tone, title, children }: SecretNoticeProps) {
    const colors = tone === 'warning'
        ? 'bg-amber-500/10 text-amber-600'
        : tone === 'danger'
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted text-muted-foreground';
    return (
        <div
            className={`mb-4 flex items-start gap-2 rounded-lg p-3 ${colors}`}
            role={tone === 'danger' ? 'alert' : undefined}
        >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 text-sm">
                {title && <p className="font-medium">{title}</p>}
                <div className="text-muted-foreground">{children}</div>
            </div>
        </div>
    );
}
