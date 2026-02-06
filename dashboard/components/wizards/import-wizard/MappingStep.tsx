import { useMemo, useCallback, memo, type MouseEvent } from 'react';
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
import { STEP_CONTENT } from './constants';
import type { ImportConfiguration, FieldMapping } from './types';

interface MappingStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    sourceFields: string[];
    sampleData: Record<string, unknown>[];
    errors?: Record<string, string>;
}

export function MappingStep({
    config,
    updateConfig,
    sourceFields,
    sampleData,
    errors = {},
}: MappingStepProps) {
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
            title={STEP_CONTENT.mapping.title}
            description={STEP_CONTENT.mapping.description}
        >
            <div className="flex justify-end">
                <Button
                    variant="outline"
                    onClick={addMapping}
                    aria-label="Add field mapping"
                    data-testid="datahub-wizard-mapping-add-btn"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Mapping
                </Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="grid grid-cols-12 gap-4 p-4 bg-muted font-medium text-sm">
                        <div className="col-span-4">Source Field</div>
                        <div className="col-span-1 flex items-center justify-center">
                            <ArrowRight className="w-4 h-4" />
                        </div>
                        <div className="col-span-4">Target Field</div>
                        <div className="col-span-2">Preview</div>
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

    const handleRemove = useCallback(() => {
        removeMapping(index);
    }, [index, removeMapping]);

    return (
        <div className="grid grid-cols-12 gap-4 p-4 items-center" data-testid={`datahub-wizard-mapping-row-${index}`}>
            <div className="col-span-4">
                <Select
                    value={mapping.sourceField || SENTINEL_VALUES.EMPTY}
                    onValueChange={sourceField => {
                        updateMapping(index, {
                            sourceField: sourceField === SENTINEL_VALUES.EMPTY ? '' : sourceField,
                            preview: sampleData.slice(0, UI_LIMITS.SAMPLE_VALUES_LIMIT).map(r => r[sourceField]),
                        });
                    }}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select source field" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={SENTINEL_VALUES.EMPTY}>-- Not mapped --</SelectItem>
                        {sourceFields.map(field => (
                            <SelectItem key={field} value={field}>
                                {field}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="col-span-1 flex items-center justify-center">
                {mapping.sourceField ? (
                    <Link className="w-4 h-4 text-green-500" />
                ) : (
                    <Unlink className="w-4 h-4 text-muted-foreground" />
                )}
            </div>

            <div className="col-span-4">
                <div className="flex items-center gap-2">
                    <Select
                        value={mapping.targetField || SENTINEL_VALUES.EMPTY}
                        onValueChange={targetField => updateMapping(index, {
                            targetField: targetField === SENTINEL_VALUES.EMPTY ? '' : targetField,
                            required: (config.targetSchema?.fields[targetField] as EnhancedFieldDefinition)?.required ?? false,
                        })}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select target field" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={SENTINEL_VALUES.EMPTY}>-- Select --</SelectItem>
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
                        <Badge variant="destructive" className="text-xs">required</Badge>
                    )}
                </div>
                {fieldDef && (
                    <div className="text-xs text-muted-foreground mt-1">
                        Type: {fieldDef.type}
                    </div>
                )}
            </div>

            <div className="col-span-2">
                <div className="text-xs font-mono text-muted-foreground">
                    {/* Index as key acceptable - static preview values, not reordered */}
                    {(mapping.preview ?? []).slice(0, 2).map((v, previewIndex) => (
                        <div key={`preview-${previewIndex}`} className="truncate">
                            {String(v ?? '(empty)')}
                        </div>
                    ))}
                </div>
            </div>

            <div className="col-span-1 flex justify-end">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRemove}
                    aria-label="Remove mapping"
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

    return (
        <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <div className="font-medium text-amber-800">Unmapped Required Fields</div>
                        <div className="text-sm text-amber-700 mt-1">
                            {unmappedRequiredFields.length > 0
                                ? unmappedRequiredFields.join(', ')
                                : 'All required fields are mapped'}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
