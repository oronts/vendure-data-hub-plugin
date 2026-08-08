import { memo, useCallback, useMemo } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@vendure/dashboard';
import { ArrowRight, Check, ChevronRight, GripVertical, Settings, Trash2 } from 'lucide-react';
import type { WizardTransformationStep } from '../../../types/wizard';
import { resolveIconName } from '../../../utils/icon-resolver';
import { summarizeConfig } from './transform-config-summary';
import type { ImportConfiguration } from './types';
import {
    type EnrichedTransformTypeOption,
    getCategoryColor,
} from './transform-operator-metadata';

interface TransformPipelineCardProps {
    transformations: ImportConfiguration['transformations'];
    transformTypes: EnrichedTransformTypeOption[];
    onRemove: (id: string) => void;
    onSettings: (transform: WizardTransformationStep) => void;
}

export function TransformPipelineCard({
    transformations,
    transformTypes,
    onRemove,
    onSettings,
}: TransformPipelineCardProps) {
    const { t } = useLingui();

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                        <ChevronRight className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-sm"><Trans>Transformation pipeline</Trans></CardTitle>
                        <CardDescription className="text-xs">
                            {transformations.length === 1
                                ? t`${transformations.length} step applied in order from top to bottom`
                                : t`${transformations.length} steps applied in order from top to bottom`}
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

const TransformPipelineRow = memo(function TransformPipelineRow({
    transform,
    transformTypes,
    index,
    isLast,
    onRemove,
    onSettings,
}: TransformPipelineRowProps) {
    const { t } = useLingui();
    const handleRemove = useCallback(() => onRemove(transform.id), [transform.id, onRemove]);
    const handleSettings = useCallback(() => onSettings(transform), [transform, onSettings]);
    const hasConfig = Object.keys(transform.config).length > 0;
    const typeMeta = useMemo(
        () => transformTypes.find(type => type.id === transform.type),
        [transformTypes, transform.type],
    );
    const colors = getCategoryColor(typeMeta?.category ?? 'DATA');
    const IconComponent = resolveIconName(typeMeta?.icon ?? undefined);
    const summary = hasConfig
        ? summarizeConfig(transform.type, transform.config, {
            empty: t`(empty)`,
            remove: fields => t`Remove: ${fields}`,
            keep: fields => t`Keep: ${fields}`,
            rule: (action, count) => count === 1
                ? t`${action} (${count} rule)`
                : t`${action} (${count} rules)`,
            lookup: field => t`Lookup: ${field}`,
            fields: count => t`${count} fields configured`,
        })
        : '';

    return (
        <div className="relative">
            <div className={`group flex items-center gap-2 p-2.5 border rounded-lg transition-all hover:shadow-sm ${hasConfig ? 'border-border' : 'border-dashed border-muted-foreground/30'}`}>
                <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${colors.accent}`} />
                <div className="flex flex-col items-center gap-0.5 shrink-0 ml-2 cursor-grab opacity-40 group-hover:opacity-70 transition-opacity">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${colors.badge}`}>
                    {IconComponent
                        ? <IconComponent className="w-3.5 h-3.5" />
                        : <span className="text-[10px] font-bold">{index + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{typeMeta?.label ?? transform.type}</span>
                        {hasConfig && <Check className="w-3 h-3 text-green-600 shrink-0" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                        {summary
                            ? <span className="font-mono">{summary}</span>
                            : typeMeta?.description}
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={handleSettings}
                        data-testid={`datahub-transform-settings-${transform.id}-button`}
                        aria-label={t`Configure ${typeMeta?.label ?? transform.type} transformation`}
                    >
                        <Settings className="w-3.5 h-3.5" />
                        {hasConfig ? t`Edit` : t`Configure`}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-50 hover:opacity-100"
                        onClick={handleRemove}
                        aria-label={t`Remove ${typeMeta?.label ?? transform.type} transformation`}
                        data-testid={`datahub-transform-remove-${transform.id}-button`}
                    >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                </div>
            </div>
            {!isLast && (
                <div className="flex justify-center py-0.5">
                    <ArrowRight className="w-3 h-3 text-muted-foreground/40 rotate-90" />
                </div>
            )}
        </div>
    );
});
