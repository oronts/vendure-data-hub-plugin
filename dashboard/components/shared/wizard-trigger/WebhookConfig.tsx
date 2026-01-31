import * as React from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
} from '@vendure/dashboard';
import { DATAHUB_API_BASE } from '../../../constants';
import type { WebhookConfigProps } from '../../../types';

export function WebhookConfig({ webhookPath, onChange, showCard = true }: WebhookConfigProps) {
    const webhookPrefix = `${DATAHUB_API_BASE}/webhook`;

    const content = (
        <div className="space-y-4">
            <div>
                <Label>Webhook Path</Label>
                <div className="flex gap-2">
                    <span className="flex items-center px-3 bg-muted rounded-l-lg text-sm text-muted-foreground">
                        {webhookPrefix}/
                    </span>
                    <Input
                        value={webhookPath}
                        onChange={e => onChange(e.target.value)}
                        placeholder="my-pipeline"
                        className="flex-1"
                    />
                </div>
            </div>

            <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm font-medium mb-2">Webhook URL</div>
                <code className="text-xs break-all">
                    https://your-domain.com{webhookPrefix}/{webhookPath || 'my-pipeline'}
                </code>
            </div>
        </div>
    );

    if (!showCard) {
        return content;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Webhook Configuration</CardTitle>
            </CardHeader>
            <CardContent>{content}</CardContent>
        </Card>
    );
}
