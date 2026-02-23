import { useState, useCallback, useMemo, memo } from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Label,
    Textarea,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
    Separator,
} from '@vendure/dashboard';
import {
    Trash2,
    Settings,
    GripVertical,
    Zap,
    Check,
    ChevronRight,
    ArrowRight,
} from 'lucide-react';
import { WizardStepContainer } from '../shared';
import { EmptyState } from '../../shared/feedback';
import { SchemaFormRenderer } from '../../shared/schema-form';
import {
    AdvancedMapEditor,
    AdvancedTemplateEditor,
    AdvancedWhenEditor,
} from '../../shared/step-config/AdvancedEditors';
import { STEP_CONTENT } from './constants';
import type { TransformTypeOption } from './constants';
import type { ImportConfiguration, TransformationType } from './types';
import type { WizardTransformationStep } from '../../../types/wizard';
import type { AdapterSchemaField } from '../../../types';
import { useAdaptersByType } from '../../../hooks/api/use-adapters';
import { resolveIconName } from '../../../utils/icon-resolver';

interface TransformStepProps {
    config: Partial<ImportConfiguration>;
    updateConfig: (updates: Partial<ImportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function TransformStep({ config, updateConfig, errors = {} }: TransformStepProps) {
    const [editingTransform, setEditingTransform] = useState<WizardTransformationStep | null>(null);
    const { data: operators } = useAdaptersByType('OPERATOR');
    const transformTypes = useTransformTypesFromData(operators);

    const addTransform = useCallback((type: TransformationType) => {
        updateConfig({
            transformations: [
                ...(config.transformations ?? []),
                { id: `${type}-${Date.now()}`, type, config: {} },
            ],
        });
    }, [config.transformations, updateConfig]);

    const removeTransform = useCallback((id: string) => {
        updateConfig({
            transformations: (config.transformations ?? []).filter(t => t.id !== id),
        });
    }, [config.transformations, updateConfig]);

    const openSettings = useCallback((transform: WizardTransformationStep) => {
        setEditingTransform({ ...transform, config: { ...transform.config } });
    }, []);

    const saveSettings = useCallback((updatedConfig: Record<string, unknown>) => {
        if (!editingTransform) return;
        updateConfig({
            transformations: (config.transformations ?? []).map(t =>
                t.id === editingTransform.id ? { ...t, config: updatedConfig } : t,
            ),
        });
        setEditingTransform(null);
    }, [editingTransform, config.transformations, updateConfig]);

    return (
        <WizardStepContainer
            title={STEP_CONTENT.transform.title}
            description={STEP_CONTENT.transform.description}
        >
            <TransformTypeButtons onAdd={addTransform} operators={operators} />

            {(config.transformations?.length ?? 0) > 0 && (
                <TransformPipelineCard
                    transformations={config.transformations!}
                    transformTypes={transformTypes}
                    onRemove={removeTransform}
                    onSettings={openSettings}
                />
            )}

            {(config.transformations?.length ?? 0) === 0 && (
                <EmptyState
                    icon={<Zap className="h-8 w-8" />}
                    title={STEP_CONTENT.transform.emptyTitle}
                    description={STEP_CONTENT.transform.emptyDescription}
                />
            )}

            {editingTransform && (
                <TransformConfigDialog
                    transform={editingTransform}
                    transformTypes={transformTypes}
                    operators={operators}
                    onSave={saveSettings}
                    onClose={() => setEditingTransform(null)}
                />
            )}
        </WizardStepContainer>
    );
}

/**
 * Category color palette for operator groups.
 * Maps backend category keys to Tailwind-compatible color classes.
 */
const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; accent: string; badge: string }> = {
    DATA: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', accent: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
    STRING: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', accent: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
    NUMERIC: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', accent: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
    DATE: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', accent: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700' },
    LOGIC: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', accent: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700' },
    VALIDATION: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', accent: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
    JSON: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', accent: 'bg-cyan-500', badge: 'bg-cyan-100 text-cyan-700' },
    AGGREGATION: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', accent: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700' },
    ENRICHMENT: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', accent: 'bg-teal-500', badge: 'bg-teal-100 text-teal-700' },
    FILE: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', accent: 'bg-slate-500', badge: 'bg-slate-100 text-slate-700' },
    SCRIPT: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', accent: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700' },
};

const DEFAULT_CATEGORY_COLOR = { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', accent: 'bg-gray-500', badge: 'bg-gray-100 text-gray-700' };

function getCategoryColor(category: string) {
    return CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLOR;
}

/** Extended transform type option with icon and category metadata */
interface EnrichedTransformTypeOption extends TransformTypeOption {
    icon?: string | null;
    color?: string | null;
    category?: string | null;
}

interface OperatorGroup {
    category: string;
    label: string;
    order: number;
    operators: EnrichedTransformTypeOption[];
}

type OperatorData = Array<{
    code: string;
    name?: string | null;
    description?: string | null;
    category?: string | null;
    categoryLabel?: string | null;
    categoryOrder?: number | null;
    wizardHidden?: boolean | null;
    icon?: string | null;
    color?: string | null;
    schema?: { fields: Array<{ key: string; label?: string | null; type: string; required?: boolean | null; defaultValue?: unknown; placeholder?: string | null; description?: string | null; options?: Array<{ value: string; label: string }> | null; group?: string | null; dependsOn?: { field: string; value: unknown; operator?: string | null } | null; validation?: { min?: number | null; max?: number | null; minLength?: number | null; maxLength?: number | null; pattern?: string | null; patternMessage?: string | null } | null }> };
}>;

/**
 * Build the transform type list from dynamic operator adapters.
 * Returns an empty array while loading (the UI shows a loading skeleton).
 */
function useTransformTypesFromData(operators: OperatorData | undefined): EnrichedTransformTypeOption[] {
    return useMemo(() => {
        if (!operators?.length) return [];
        return operators
            .filter(op => op.wizardHidden !== true)
            .map(op => ({
                id: op.code,
                label: op.name ?? op.code,
                description: op.description ?? '',
                icon: op.icon,
                color: op.color,
                category: op.category,
            }));
    }, [operators]);
}

/**
 * Build grouped operator list for the category-based UI.
 * Uses `categoryLabel` and `categoryOrder` from backend adapter metadata.
 */
function useTransformGroupsFromData(operators: OperatorData | undefined): OperatorGroup[] {
    return useMemo(() => {
        if (!operators?.length) return [];

        const groups = new Map<string, { label: string; order: number; operators: EnrichedTransformTypeOption[] }>();

        for (const op of operators) {
            if (op.wizardHidden === true) continue;
            const cat = op.category ?? 'DATA';
            let group = groups.get(cat);
            if (!group) {
                const label = op.categoryLabel ?? cat;
                const order = op.categoryOrder ?? 999;
                group = { label, order, operators: [] };
                groups.set(cat, group);
            }
            group.operators.push({
                id: op.code,
                label: op.name ?? op.code,
                description: op.description ?? '',
                icon: op.icon,
                color: op.color,
                category: cat,
            });
        }

        const result: OperatorGroup[] = [];
        for (const [cat, group] of groups) {
            result.push({ category: cat, label: group.label, order: group.order, operators: group.operators });
        }

        result.sort((a, b) => a.order - b.order);

        return result;
    }, [operators]);
}

interface TransformTypeButtonsProps {
    onAdd: (type: TransformationType) => void;
    operators: OperatorData | undefined;
}

/** Number of placeholder cards shown while operators are loading. */
const LOADING_OPERATOR_COUNT = 10;

function TransformTypeButtons({ onAdd, operators }: TransformTypeButtonsProps) {
    const groups = useTransformGroupsFromData(operators);

    // Show loading skeleton while operators are loading
    if (!operators) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2" data-testid="datahub-transform-type-buttons">
                {Array.from({ length: LOADING_OPERATOR_COUNT }, (_, i) => (
                    <div key={`loading-${i}`} className="h-auto py-2 px-2.5 flex items-start gap-2 rounded-md border border-muted animate-pulse">
                        <div className="w-5 h-5 bg-muted rounded mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <div className="h-3 bg-muted rounded w-3/4 mb-1" />
                            <div className="h-2 bg-muted rounded w-full" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // No operators registered (shouldn't happen in practice)
    if (groups.length === 0) {
        return (
            <div className="text-sm text-muted-foreground p-4 text-center" data-testid="datahub-transform-type-buttons">
                No operator types available
            </div>
        );
    }

    return (
        <div className="space-y-4" data-testid="datahub-transform-type-buttons">
            {groups.map(group => {
                const colors = getCategoryColor(group.category);
                return (
                    <div key={group.category}>
                        <div className="flex items-center gap-2 mb-2">
                            <div className={`w-1.5 h-4 rounded-full ${colors.accent}`} />
                            <h4 className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>
                                {group.label}
                            </h4>
                            <span className="text-[10px] text-muted-foreground">
                                ({group.operators.length})
                            </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            {group.operators.map(type => (
                                <TransformTypeButton
                                    key={type.id}
                                    type={type}
                                    category={group.category}
                                    onAdd={onAdd}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

interface TransformTypeButtonProps {
    type: EnrichedTransformTypeOption;
    category?: string;
    onAdd: (type: TransformationType) => void;
}

const TransformTypeButton = memo(function TransformTypeButton({ type, category, onAdd }: TransformTypeButtonProps) {
    const handleClick = useCallback(() => {
        onAdd(type.id as TransformationType);
    }, [type.id, onAdd]);

    const IconComponent = resolveIconName(type.icon ?? undefined);
    const colors = getCategoryColor(category ?? type.category ?? 'DATA');

    return (
        <button
            type="button"
            className={`group relative h-auto py-2 px-2.5 flex items-start gap-2 text-left rounded-md border transition-all duration-150 ${colors.border} ${colors.bg} hover:shadow-sm hover:scale-[1.02] active:scale-[0.98]`}
            onClick={handleClick}
            title={type.description}
            data-testid={`datahub-transform-add-${type.id}-button`}
        >
            {IconComponent && (
                <div className={`shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center ${colors.badge}`}>
                    <IconComponent className="w-3 h-3" />
                </div>
            )}
            <div className="min-w-0 flex-1">
                <span className="text-xs font-medium leading-tight block">{type.label}</span>
                <span className="text-[10px] text-muted-foreground leading-tight line-clamp-2">{type.description}</span>
            </div>
        </button>
    );
});

interface TransformPipelineCardProps {
    transformations: ImportConfiguration['transformations'];
    transformTypes: EnrichedTransformTypeOption[];
    onRemove: (id: string) => void;
    onSettings: (transform: WizardTransformationStep) => void;
}

function TransformPipelineCard({ transformations, transformTypes, onRemove, onSettings }: TransformPipelineCardProps) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                        <ChevronRight className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-sm">Transformation Pipeline</CardTitle>
                        <CardDescription className="text-xs">
                            {transformations.length} step{transformations.length !== 1 ? 's' : ''} applied in order from top to bottom
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0">
                {transformations.map((transform, index) => (
                    <TransformPipelineRow
                        key={transform.id}
                        transform={transform}
                        transformTypes={transformTypes}
                        index={index}
                        isLast={index === transformations.length - 1}
                        onRemove={onRemove}
                        onSettings={onSettings}
                    />
                ))}
            </CardContent>
        </Card>
    );
}

interface TransformPipelineRowProps {
    transform: ImportConfiguration['transformations'][number];
    transformTypes: EnrichedTransformTypeOption[];
    index: number;
    isLast: boolean;
    onRemove: (id: string) => void;
    onSettings: (transform: WizardTransformationStep) => void;
}

const TransformPipelineRow = memo(function TransformPipelineRow({ transform, transformTypes, index, isLast, onRemove, onSettings }: TransformPipelineRowProps) {

    const handleRemove = useCallback(() => {
        onRemove(transform.id);
    }, [transform.id, onRemove]);

    const handleSettings = useCallback(() => {
        onSettings(transform);
    }, [transform, onSettings]);

    const hasConfig = Object.keys(transform.config).length > 0;
    const typeMeta = useMemo(
        () => transformTypes.find(t => t.id === transform.type),
        [transformTypes, transform.type],
    );
    const typeDescription = typeMeta?.description;
    const category = typeMeta?.category ?? 'DATA';
    const colors = getCategoryColor(category);
    const IconComponent = resolveIconName(typeMeta?.icon ?? undefined);
    const summary = hasConfig ? summarizeConfig(transform.type, transform.config) : '';

    return (
        <div className="relative">
            <div className={`group flex items-center gap-2 p-2.5 border rounded-lg transition-all hover:shadow-sm ${hasConfig ? 'border-border' : 'border-dashed border-muted-foreground/30'}`}>
                {/* Category color accent bar */}
                <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${colors.accent}`} />

                {/* Drag handle */}
                <div className="flex flex-col items-center gap-0.5 shrink-0 ml-2 cursor-grab opacity-40 group-hover:opacity-70 transition-opacity">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                </div>

                {/* Step number badge with operator icon */}
                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${colors.badge}`}>
                    {IconComponent
                        ? <IconComponent className="w-3.5 h-3.5" />
                        : <span className="text-[10px] font-bold">{index + 1}</span>
                    }
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{typeMeta?.label ?? transform.type}</span>
                        {hasConfig && (
                            <Check className="w-3 h-3 text-green-600 shrink-0" />
                        )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                        {summary ? (
                            <span className="font-mono">{summary}</span>
                        ) : (
                            typeDescription
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={handleSettings}
                        data-testid={`datahub-transform-settings-${transform.id}-button`}
                        aria-label="Configure transform"
                    >
                        <Settings className="w-3.5 h-3.5" />
                        {hasConfig ? 'Edit' : 'Configure'}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-50 hover:opacity-100"
                        onClick={handleRemove}
                        aria-label={`Remove ${transform.type} transform`}
                        data-testid={`datahub-transform-remove-${transform.id}-button`}
                    >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                </div>
            </div>

            {/* Connector line between steps */}
            {!isLast && (
                <div className="flex justify-center py-0.5">
                    <ArrowRight className="w-3 h-3 text-muted-foreground/40 rotate-90" />
                </div>
            )}
        </div>
    );
});

/**
 * Produce a human-readable summary of an operator's configuration.
 * Returns short strings like "field: price, format: USD" or "from: name -> to: productName".
 */
function summarizeConfig(type: string, config: Record<string, unknown>): string {
    const entries = Object.entries(config).filter(([, v]) => v != null && v !== '');
    if (entries.length === 0) return '';

    // Type-specific summaries for common operators
    if (type === 'rename' && config.from && config.to) {
        return `${config.from} \u2192 ${config.to}`;
    }
    if (type === 'copy' && config.from && config.to) {
        return `${config.from} \u2192 ${config.to}`;
    }
    if (type === 'set' && config.field) {
        const val = config.value != null ? String(config.value) : '(empty)';
        return `${config.field} = ${val.length > 20 ? val.slice(0, 20) + '\u2026' : val}`;
    }
    if (type === 'remove' && (config.fields || config.field)) {
        const fields = config.fields ?? config.field;
        return `remove: ${Array.isArray(fields) ? fields.join(', ') : String(fields)}`;
    }
    if (type === 'pick' && config.fields) {
        const fields = config.fields;
        return `keep: ${Array.isArray(fields) ? fields.join(', ') : String(fields)}`;
    }
    if (type === 'template' && config.template) {
        const tmpl = String(config.template);
        return tmpl.length > 30 ? tmpl.slice(0, 30) + '\u2026' : tmpl;
    }
    if ((type === 'filter' || type === 'when') && config.action) {
        const ruleCount = Array.isArray(config.conditions) ? config.conditions.length : 0;
        return `${config.action} (${ruleCount} rule${ruleCount !== 1 ? 's' : ''})`;
    }
    if (type === 'lookup' && config.field) {
        return `lookup: ${config.field}`;
    }
    if (type === 'dateParse' && config.field) {
        return `${config.field}${config.format ? ` (${config.format})` : ''}`;
    }

    // Generic summary: show key=value pairs
    if (entries.length <= 2) {
        return entries.map(([k, v]) => {
            const s = String(v);
            return `${k}: ${s.length > 15 ? s.slice(0, 15) + '\u2026' : s}`;
        }).join(', ');
    }
    return `${entries.length} fields configured`;
}

// --- Transform Config Dialog ---

interface TransformConfigDialogProps {
    transform: WizardTransformationStep;
    transformTypes: EnrichedTransformTypeOption[];
    operators: OperatorData | undefined;
    onSave: (config: Record<string, unknown>) => void;
    onClose: () => void;
}

function TransformConfigDialog({ transform, transformTypes, operators, onSave, onClose }: TransformConfigDialogProps) {
    const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(transform.config);

    const handleConfigUpdate = useCallback((updated: Record<string, unknown>) => {
        setLocalConfig(updated);
    }, []);

    const handleSave = useCallback(() => {
        // Remove empty/undefined values and internal helper keys (prefixed with _)
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(localConfig)) {
            if (k.startsWith('_')) continue;
            if (v !== '' && v !== undefined && v !== null) {
                cleaned[k] = v;
            }
        }
        onSave(cleaned);
    }, [localConfig, onSave]);

    const typeMeta = useMemo(
        () => transformTypes.find(t => t.id === transform.type),
        [transformTypes, transform.type],
    );

    const category = typeMeta?.category ?? 'DATA';
    const colors = getCategoryColor(category);
    const IconComponent = resolveIconName(typeMeta?.icon ?? undefined);
    const fieldCount = operators?.find(op => op.code === transform.type)?.schema?.fields?.length ?? 0;

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors.badge}`}>
                            {IconComponent
                                ? <IconComponent className="w-4.5 h-4.5" />
                                : <Settings className="w-4.5 h-4.5" />
                            }
                        </div>
                        <div>
                            <DialogTitle className="text-base">
                                Configure {typeMeta?.label ?? transform.type}
                            </DialogTitle>
                            <DialogDescription className="mt-0.5">
                                {typeMeta?.description}
                            </DialogDescription>
                        </div>
                    </div>
                    {fieldCount > 0 && (
                        <div className="mt-3">
                            <Separator />
                            <p className="text-[11px] text-muted-foreground mt-2">
                                {fieldCount} configuration field{fieldCount !== 1 ? 's' : ''} available
                            </p>
                        </div>
                    )}
                </DialogHeader>
                <div className="space-y-4 py-1">
                    <TransformConfigFields
                        type={transform.type}
                        config={localConfig}
                        onUpdate={handleConfigUpdate}
                        operators={operators}
                    />
                </div>
                <Separator />
                <DialogFooter className="pt-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Configuration</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

interface TransformConfigFieldsProps {
    type: string;
    config: Record<string, unknown>;
    onUpdate: (config: Record<string, unknown>) => void;
    operators?: OperatorData;
}

function TransformConfigFields({ type, config, onUpdate, operators }: TransformConfigFieldsProps) {
    // Find the operator's schema from backend data
    const operator = operators?.find(op => op.code === type);
    const schema = operator?.schema;

    // Operators with custom interactive editors keep their custom components
    if (type === 'map') {
        return <AdvancedMapEditor config={config} onChange={onUpdate} />;
    }
    if (type === 'template') {
        return <AdvancedTemplateEditor config={config} onChange={onUpdate} />;
    }
    if (type === 'filter' || type === 'when') {
        return <AdvancedWhenEditor config={config} onChange={onUpdate} />;
    }

    // For all other operators: render from schema
    if (schema?.fields?.length) {
        return (
            <SchemaFormRenderer
                schema={{ fields: schema.fields as AdapterSchemaField[] }}
                values={config}
                onChange={onUpdate}
                compact
            />
        );
    }

    // Fallback: JSON config editor
    return (
        <div className="space-y-2">
            <Label className="text-sm font-medium">Configuration (JSON)</Label>
            <Textarea
                value={JSON.stringify(config, null, 2)}
                onChange={(e) => {
                    try { onUpdate(JSON.parse(e.target.value)); } catch { /* ignore parse errors while typing */ }
                }}
                className="font-mono text-xs"
                rows={4}
            />
        </div>
    );
}
