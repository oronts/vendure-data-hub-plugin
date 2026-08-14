import { useMemo, useCallback, memo } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Card,
    CardContent,
    Badge,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import {
    Plus,
    Trash2,
    ArrowRight,
    Link,
    Unlink,
    AlertCircle,
} from 'lucide-react';
import { WizardStepContainer } from '../shared';
import { UI_LIMITS, SENTINEL_VALUES } from '../../../constants';
import type { EnhancedFieldDefinition } from '../../../types';
import type { ImportConfiguration, FieldMapping } from './types';

interface MappingStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    sourceFields: string[];
    sampleData: Record<string, unknown>[];
}

export function MappingStep({
    config,
    updateConfig,
    sourceFields,
    sampleData,
}: MappingStepProps) {
    const { t } = useLingui();
    const updateMapping = useCallback((index: number, updates: Partial<FieldMapping>) => {
        const newMappings = [...(config.mappings ?? [])];
        newMappings[index] = { ...newMappings[index], ...updates };
        updateConfig({ mappings: newMappings });
    }, [config.mappings, updateConfig]);

    const removeMapping = useCallback((index: number) => {
        updateConfig({
            mappings: (config.mappings ?? []).filter((_, i) => i !== index),
        });
    }, [config.mappings, updateConfig]);

    const addMapping = useCallback(() => {
        updateConfig({
            mappings: [
                ...(config.mappings ?? []),
                { sourceField: '', targetField: '', required: false, preview: [] },
            ],
        });
    }, [config.mappings, updateConfig]);

    const targetFields = useMemo(
        () => (config.targetSchema ? Object.keys(config.targetSchema.fields) : []),
        [config.targetSchema]
    );

    const usedTargetFields = useMemo(
        () => new Set((config.mappings ?? []).map(m => m.targetField)),
        [config.mappings]
    );

    return (
        <WizardStepContainer
            title={t`Map fields`}
            description={t`Connect source fields to target entity fields.`}
        >
            <div className="flex justify-end">
                <Button
                    variant="outline"
                    onClick={addMapping}
                    aria-label={t`Add field mapping`}
                    data-testid="datahub-wizard-mapping-add-btn"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    <Trans>Add mapping</Trans>
                </Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="hidden grid-cols-12 gap-4 bg-muted p-4 text-sm font-medium md:grid">
                        <div className="col-span-4"><Trans>Source field</Trans></div>
                        <div className="col-span-1 flex items-center justify-center">
                            <ArrowRight className="w-4 h-4" />
                        </div>
                        <div className="col-span-4"><Trans>Target field</Trans></div>
                        <div className="col-span-2"><Trans>Preview</Trans></div>
                        <div className="col-span-1"></div>
                    </div>

                    <div className="divide-y">
                        {(config.mappings ?? []).map((mapping, index) => (
                            <MappingRow
                                key={mapping.targetField || `mapping-${index}`}
                                mapping={mapping}
                                index={index}
                                sourceFields={sourceFields}
                                targetFields={targetFields}
                                usedTargetFields={usedTargetFields}
                                config={config}
                                sampleData={sampleData}
                                updateMapping={updateMapping}
                                removeMapping={removeMapping}
                            />
                        ))}
                    </div>
                </CardContent>
            </Card>

            {config.targetSchema && (
                <UnmappedFieldsWarning config={config} />
            )}
        </WizardStepContainer>
    );
}

interface MappingRowProps {
    mapping: FieldMapping;
    index: number;
    sourceFields: string[];
    targetFields: string[];
    usedTargetFields: Set<string>;
    config: Partial<ImportConfiguration>;
    sampleData: Record<string, unknown>[];
    updateMapping: (index: number, updates: Partial<FieldMapping>) => void;
    removeMapping: (index: number) => void;
}

const MappingRow = memo(function MappingRow({
    mapping,
    index,
    sourceFields,
    targetFields,
    usedTargetFields,
    config,
    sampleData,
    updateMapping,
    removeMapping,
}: MappingRowProps) {
    const fieldDef = config.targetSchema?.fields[mapping.targetField] as EnhancedFieldDefinition | undefined;
    const { t } = useLingui();

    const handleRemove = useCallback(() => {
        removeMapping(index);
    }, [index, removeMapping]);

    return (
        <div className="grid grid-cols-1 items-center gap-4 p-4 md:grid-cols-12" data-testid={`datahub-wizard-mapping-row-${index}`}>
            <div className="md:col-span-4">
                <span className="mb-1 block text-xs font-medium md:hidden">
                    <Trans>Source field</Trans>
                </span>
                <Select
                    value={mapping.sourceField || SENTINEL_VALUES.EMPTY}
                    onValueChange={sourceField => {
                        if (sourceField == null) return;
                        updateMapping(index, {
                            sourceField: sourceField === SENTINEL_VALUES.EMPTY ? '' : sourceField,
                            preview: sampleData.slice(0, UI_LIMITS.SAMPLE_VALUES_LIMIT).map(r => r[sourceField]),
                        });
                    }}
                >
                    <SelectTrigger
                        aria-label={t`Source field`}
                    >
                        <SelectValue placeholder={t`Select a source field`} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={SENTINEL_VALUES.EMPTY}><Trans>Not mapped</Trans></SelectItem>
                        {sourceFields.map(field => (
                            <SelectItem key={field} value={field}>
                                {field}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="hidden items-center justify-center md:col-span-1 md:flex">
                {mapping.sourceField ? (
                    <Link className="w-4 h-4 text-green-500" />
                ) : (
                    <Unlink className="w-4 h-4 text-muted-foreground" />
                )}
            </div>

            <div className="md:col-span-4">
                <span className="mb-1 block text-xs font-medium md:hidden">
                    <Trans>Target field</Trans>
                </span>
                <div className="flex items-center gap-2">
                    <Select
                        value={mapping.targetField || SENTINEL_VALUES.EMPTY}
                        onValueChange={targetField => {
                            if (targetField == null) return;
                            updateMapping(index, {
                                targetField: targetField === SENTINEL_VALUES.EMPTY ? '' : targetField,
                                required: (config.targetSchema?.fields[targetField] as EnhancedFieldDefinition)?.required ?? false,
                            });
                        }}
                    >
                        <SelectTrigger
                            aria-label={t`Target field`}
                        >
                            <SelectValue placeholder={t`Select a target field`} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={SENTINEL_VALUES.EMPTY}><Trans>Select</Trans></SelectItem>
                            {targetFields
                                .filter(f => !usedTargetFields.has(f) || f === mapping.targetField)
                                .map(field => {
                                    const def = config.targetSchema?.fields[field] as EnhancedFieldDefinition;
                                    return (
                                        <SelectItem key={field} value={field}>
                                            {field} {def?.required && '*'}
                                        </SelectItem>
                                    );
                                })}
                        </SelectContent>
                    </Select>
                    {mapping.required && (
                        <Badge variant="destructive" className="text-xs"><Trans>Required</Trans></Badge>
                    )}
                </div>
                {fieldDef && (
                    <div className="text-xs text-muted-foreground mt-1">
                        {t`Type: ${fieldDef.type}`}
                    </div>
                )}
            </div>

            <div className="md:col-span-2">
                <span className="mb-1 block text-xs font-medium md:hidden">
                    <Trans>Preview</Trans>
                </span>
                <div className="text-xs font-mono text-muted-foreground">
                    {/* Index as key acceptable - static preview values, not reordered */}
                    {(mapping.preview ?? []).slice(0, 2).map((v, previewIndex) => (
                        <div key={`preview-${previewIndex}`} className="truncate">
                            {String(v ?? t`(empty)`)}
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-end md:col-span-1">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRemove}
                    aria-label={t`Remove field mapping`}
                >
                    <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
            </div>
        </div>
    );
});

interface UnmappedFieldsWarningProps {
    config: Partial<ImportConfiguration>;
}

function UnmappedFieldsWarning({ config }: UnmappedFieldsWarningProps) {
    const unmappedRequiredFields = config.targetSchema
        ? Object.entries(config.targetSchema.fields)
            .filter(([name, field]) =>
                (field as EnhancedFieldDefinition).required &&
                !config.mappings?.some(m => m.targetField === name && m.sourceField)
            )
            .map(([name]) => name)
        : [];

    if (unmappedRequiredFields.length === 0) {
        return null;
    }

    return (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <div className="font-medium text-amber-800 dark:text-amber-200"><Trans>Unmapped required fields</Trans></div>
                        <div className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                            {unmappedRequiredFields.join(', ')}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
