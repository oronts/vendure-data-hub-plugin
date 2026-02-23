import * as React from 'react';
import { STEP_TYPE, DATAHUB_API_WEBHOOK } from '../../../constants';
import type { PipelineDefinition, PipelineStep } from '../../../types';

export interface PipelineWebhookInfoProps {
    /** Function that returns the current pipeline definition */
    definition: () => PipelineDefinition | undefined;
}

interface WebhookTriggerInfo {
    key: string;
    requiresIdk: boolean;
    sig: boolean;
    headerName: string;
    authType: string;
}

/**
 * Displays webhook trigger information including URL and example cURL command.
 * Shows info for ALL webhook triggers configured on the pipeline.
 */
export function PipelineWebhookInfo({
    definition,
}: Readonly<PipelineWebhookInfoProps>) {
    const def = definition() ?? {};
    const steps = def.steps ?? [];

    // Find ALL webhook triggers
    const webhookTriggers: WebhookTriggerInfo[] = steps
        .filter((step): step is PipelineStep =>
            step.type === STEP_TYPE.TRIGGER &&
            (step.config as Record<string, unknown>)?.type === 'WEBHOOK'
        )
        .map(trigger => {
            const cfg = trigger.config as Record<string, unknown> ?? {};
            return {
                key: trigger.key,
                requiresIdk: Boolean(cfg.requireIdempotencyKey),
                sig: cfg.signature === 'hmac-sha256' || cfg.authentication === 'hmac',
                headerName: String(cfg.hmacHeaderName ?? cfg.headerName ?? 'x-datahub-signature'),
                authType: String(cfg.authentication ?? 'NONE'),
            };
        });

    if (webhookTriggers.length === 0) {
        return null;
    }

    const pipelineCode = def.code ?? 'PIPELINE_CODE';
    const url = `${window.location.origin}${DATAHUB_API_WEBHOOK(pipelineCode)}`;

    // Generate cURL for first webhook (as example)
    const firstWebhook = webhookTriggers[0];
    const curlParts = [
        `curl -X POST '${url}' \\`,
        `  -H 'Content-Type: application/json'`,
    ];

    if (firstWebhook.requiresIdk) {
        curlParts.push(`  -H 'X-Idempotency-Key: <unique-id>' \\`);
    }

    if (firstWebhook.sig) {
        curlParts.push(`  -H '${firstWebhook.headerName}: <hmac-of-body>' \\`);
    }

    curlParts.push(`  -d '{"records":[{"id":"123","name":"Example"}]}'`);

    const curl = curlParts.join(' \\\n');

    return (
        <div className="border rounded-md p-3 space-y-2">
            <div className="text-sm font-medium">
                Webhook Trigger{webhookTriggers.length > 1 ? 's' : ''} ({webhookTriggers.length})
            </div>
            <div className="text-sm">
                POST{' '}
                <code className="font-mono">
                    {DATAHUB_API_WEBHOOK(pipelineCode)}
                </code>
            </div>

            {webhookTriggers.length > 1 && (
                <div className="text-xs text-muted-foreground">
                    Multiple webhook triggers configured - request will authenticate against any matching trigger
                </div>
            )}

            {webhookTriggers.map((webhook, index) => (
                <div key={webhook.key} className="text-sm border-l-2 border-muted pl-2 py-1">
                    <div className="font-medium text-xs text-muted-foreground">
                        {webhookTriggers.length > 1 ? `Webhook ${index + 1}: ` : ''}
                        {webhook.key}
                    </div>
                    <div className="text-xs">
                        Auth: <code className="font-mono">{webhook.authType}</code>
                        {webhook.requiresIdk && ' • Requires Idempotency Key'}
                        {webhook.sig && ` • HMAC header: ${webhook.headerName}`}
                    </div>
                </div>
            ))}

            <div>
                <div className="text-sm font-medium mb-1">Example cURL</div>
                <pre className="bg-muted p-2 rounded text-xs overflow-auto">
                    {curl}
                </pre>
            </div>
        </div>
    );
}
