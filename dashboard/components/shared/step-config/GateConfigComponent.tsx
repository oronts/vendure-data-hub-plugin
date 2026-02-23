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
import { useApprovalTypeSchemas, type ConnectionSchemaField } from '../../../hooks/api/use-config-options';

export interface GateConfigComponentProps {
    readonly config: Record<string, unknown>;
    readonly onChange: (config: Record<string, unknown>) => void;
}

export function GateConfigComponent({
    config,
    onChange,
}: GateConfigComponentProps) {
    const { schemas: approvalTypeSchemas } = useApprovalTypeSchemas();
    const approvalType = (config.approvalType as string) || 'MANUAL';
    const currentSchema = approvalTypeSchemas.find(s => s.value === approvalType);

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
                        {approvalTypeSchemas.map((at) => (
                            <SelectItem key={at.value} value={at.value}>
                                {at.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                    {currentSchema?.description}
                </p>
            </div>

            {currentSchema && currentSchema.fields.length > 0 && (
                <div className="space-y-3">
                    {currentSchema.fields.map(field => (
                        <GateSchemaField
                            key={field.key}
                            field={field}
                            value={config[field.key]}
                            onChange={(value) => updateField(field.key, value)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface GateSchemaFieldProps {
    field: ConnectionSchemaField;
    value: unknown;
    onChange: (value: unknown) => void;
}

function GateSchemaField({ field, value, onChange }: GateSchemaFieldProps) {
    if (field.type === 'number') {
        return (
            <div className="space-y-2">
                <Label className="text-sm font-medium">{field.label}</Label>
                <Input
                    type="number"
                    value={value != null ? String(value) : ''}
                    onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : undefined;
                        onChange(val);
                    }}
                    placeholder={field.placeholder ?? undefined}
                    data-testid={`datahub-gate-${field.key}-input`}
                />
                {field.description && (
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
            </div>
        );
    }

    // Default: string/text input
    return (
        <div className="space-y-2">
            <Label className="text-sm font-medium">{field.label}</Label>
            <Input
                value={value != null ? String(value) : ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={field.placeholder ?? undefined}
                data-testid={`datahub-gate-${field.key}-input`}
            />
            {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
        </div>
    );
}
