import * as React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import {
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Input,
} from '@vendure/dashboard';

export interface GateConfigComponentProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
}

const APPROVAL_TYPES = [
    { value: 'MANUAL', label: 'Manual Approval', description: 'Requires explicit human approval to continue' },
    { value: 'THRESHOLD', label: 'Threshold', description: 'Auto-approves if error rate is below threshold' },
    { value: 'TIMEOUT', label: 'Timeout', description: 'Auto-approves after a specified timeout period' },
] as const;

export function GateConfigComponent({
    config,
    onChange,
}: GateConfigComponentProps) {
    const approvalType = (config.approvalType as string) || 'MANUAL';
    const timeoutSeconds = config.timeoutSeconds as number | undefined;
    const errorThresholdPercent = config.errorThresholdPercent as number | undefined;
    const notifyWebhook = (config.notifyWebhook as string) || '';
    const notifyEmail = (config.notifyEmail as string) || '';
    const previewCount = config.previewCount as number | undefined;

    // Use refs to avoid stale closures in the initialization effect
    const configRef = useRef(config);
    const onChangeRef = useRef(onChange);
    configRef.current = config;
    onChangeRef.current = onChange;

    // Initialize approvalType if not set
    useEffect(() => {
        if (!configRef.current.approvalType) {
            onChangeRef.current({ ...configRef.current, approvalType: 'MANUAL' });
        }
    }, []);

    const updateField = useCallback((key: string, value: unknown) => {
        onChange({ ...config, [key]: value });
    }, [config, onChange]);

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label className="text-sm font-medium">Approval Type</Label>
                <Select
                    value={approvalType}
                    onValueChange={(v) => updateField('approvalType', v)}
                >
                    <SelectTrigger className="w-full" data-testid="datahub-gate-approval-type-select">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {APPROVAL_TYPES.map((at) => (
                            <SelectItem key={at.value} value={at.value}>
                                {at.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                    {APPROVAL_TYPES.find(at => at.value === approvalType)?.description}
                </p>
            </div>

            {approvalType === 'TIMEOUT' && (
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Timeout (seconds)</Label>
                    <Input
                        type="number"
                        value={timeoutSeconds ?? ''}
                        onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : undefined;
                            updateField('timeoutSeconds', val);
                        }}
                        placeholder="300"
                        min={1}
                        data-testid="datahub-gate-timeout-input"
                    />
                    <p className="text-xs text-muted-foreground">
                        Number of seconds to wait before auto-approving
                    </p>
                </div>
            )}

            {approvalType === 'THRESHOLD' && (
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Error Threshold (%)</Label>
                    <Input
                        type="number"
                        value={errorThresholdPercent ?? ''}
                        onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : undefined;
                            updateField('errorThresholdPercent', val);
                        }}
                        placeholder="5"
                        min={0}
                        max={100}
                        data-testid="datahub-gate-threshold-input"
                    />
                    <p className="text-xs text-muted-foreground">
                        Auto-approve if error rate is below this percentage (0-100)
                    </p>
                </div>
            )}

            <div className="space-y-2">
                <Label className="text-sm font-medium">Notify Webhook</Label>
                <Input
                    value={notifyWebhook}
                    onChange={(e) => updateField('notifyWebhook', e.target.value)}
                    placeholder="https://hooks.example.com/gate-notify"
                    data-testid="datahub-gate-webhook-input"
                />
                <p className="text-xs text-muted-foreground">
                    Webhook URL to call when the gate is reached (optional)
                </p>
            </div>

            <div className="space-y-2">
                <Label className="text-sm font-medium">Notify Email</Label>
                <Input
                    value={notifyEmail}
                    onChange={(e) => updateField('notifyEmail', e.target.value)}
                    placeholder="approver@example.com"
                    type="email"
                    data-testid="datahub-gate-email-input"
                />
                <p className="text-xs text-muted-foreground">
                    Email address to notify when the gate is reached (optional)
                </p>
            </div>

            <div className="space-y-2">
                <Label className="text-sm font-medium">Preview Count</Label>
                <Input
                    type="number"
                    value={previewCount ?? ''}
                    onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : undefined;
                        updateField('previewCount', val);
                    }}
                    placeholder="10"
                    min={1}
                    data-testid="datahub-gate-preview-count-input"
                />
                <p className="text-xs text-muted-foreground">
                    Number of records to include in the gate preview (default: 10)
                </p>
            </div>
        </div>
    );
}
