import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { WEBHOOK_AUTH_HEADERS } from '../../../../shared/constants';
import {
    DATAHUB_API_WEBHOOK,
    PLACEHOLDERS,
    STEP_TYPE,
} from '../../../constants';
import type { PipelineDefinition } from '../../../types';
import { buildDataHubApiUrl } from '../../../utils/api-url';
import {
    buildWebhookExampleCurl,
    type WebhookTriggerDetails,
} from './pipeline-webhook-example';

export interface PipelineWebhookInfoProps {
    definition: PipelineDefinition | undefined;
    pipelineCode: string | undefined;
}

export function PipelineWebhookInfo({
    definition,
    pipelineCode,
}: Readonly<PipelineWebhookInfoProps>) {
    const { t } = useLingui();
    const steps = definition?.steps ?? [];

    const webhookTriggers: WebhookTriggerDetails[] = steps.flatMap(step => {
        const config = step.config;
        if (step.type !== STEP_TYPE.TRIGGER || config.type !== 'WEBHOOK') {
            return [];
        }
        return [{
            key: step.key,
            requiresIdempotencyKey: Boolean(config.requireIdempotencyKey),
            hmacHeaderName: typeof config.hmacHeaderName === 'string'
                ? config.hmacHeaderName
                : WEBHOOK_AUTH_HEADERS.HMAC_SIGNATURE,
            idempotencyHeader: typeof config.idempotencyKeyHeader === 'string'
                ? config.idempotencyKeyHeader
                : WEBHOOK_AUTH_HEADERS.IDEMPOTENCY_KEY,
            authType: typeof config.authentication === 'string'
                ? config.authentication
                : 'NONE',
            apiKeyHeaderName: typeof config.apiKeyHeaderName === 'string'
                ? config.apiKeyHeaderName
                : WEBHOOK_AUTH_HEADERS.API_KEY,
            apiKeyPrefix: typeof config.apiKeyPrefix === 'string'
                ? config.apiKeyPrefix
                : '',
            jwtHeaderName: typeof config.jwtHeaderName === 'string'
                ? config.jwtHeaderName
                : WEBHOOK_AUTH_HEADERS.JWT,
        }];
    });

    if (webhookTriggers.length === 0) {
        return null;
    }

    const resolvedPipelineCode = pipelineCode?.trim() || PLACEHOLDERS.PIPELINE_CODE;
    const url = buildDataHubApiUrl(
        DATAHUB_API_WEBHOOK(resolvedPipelineCode),
    );

    const firstWebhook = webhookTriggers[0];
    const curl = buildWebhookExampleCurl(url, firstWebhook);
    const triggerCountLabel = webhookTriggers.length === 1
        ? t`${webhookTriggers.length} webhook trigger`
        : t`${webhookTriggers.length} webhook triggers`;

    return (
        <div className="border rounded-md p-3 space-y-2">
            <div className="text-sm font-medium">
                {triggerCountLabel}
            </div>
            <div className="text-sm">
                POST{' '}
                <code className="font-mono">
                    {DATAHUB_API_WEBHOOK(resolvedPipelineCode)}
                </code>
            </div>

            {webhookTriggers.length > 1 && (
                <div className="text-xs text-muted-foreground">
                    <Trans>Multiple webhook triggers are configured. The request authenticates against any matching trigger.</Trans>
                </div>
            )}

            {webhookTriggers.map((webhook, index) => (
                <div key={webhook.key} className="text-sm border-l-2 border-muted pl-2 py-1">
                    <div className="font-medium text-xs text-muted-foreground">
                        {webhookTriggers.length > 1
                            ? `${t`Webhook ${index + 1}:`} `
                            : ''}
                        {webhook.key}
                    </div>
                    <div className="text-xs">
                        <Trans>Authentication:</Trans>{' '}
                        <code className="font-mono">{webhook.authType}</code>
                        {webhook.requiresIdempotencyKey && (
                            <> • <Trans>Requires idempotency key</Trans></>
                        )}
                        {webhook.authType === 'HMAC' && (
                            <> • <Trans>HMAC header: {webhook.hmacHeaderName}</Trans></>
                        )}
                    </div>
                </div>
            ))}

            <div>
                <div className="text-sm font-medium mb-1">
                    <Trans>Example cURL</Trans>
                </div>
                <pre className="bg-muted p-2 rounded text-xs overflow-auto">
                    {curl}
                </pre>
            </div>
        </div>
    );
}
