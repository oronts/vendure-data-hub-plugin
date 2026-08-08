import { useCallback, useMemo, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Label,
    Separator,
    Textarea,
} from '@vendure/dashboard';
import { Settings } from 'lucide-react';
import type { WizardTransformationStep } from '../../../types/wizard';
import { mapAdapterSchema } from '../../../utils/adapter-schema';
import { resolveIconName } from '../../../utils/icon-resolver';
import { SchemaFormRenderer } from '../../shared/schema-form';
import {
    AdvancedMapEditor,
    AdvancedTemplateEditor,
    AdvancedWhenEditor,
} from '../../shared/step-config/AdvancedEditors';
import {
    type EnrichedTransformTypeOption,
    getCategoryColor,
    type OperatorData,
} from './transform-operator-metadata';

interface TransformConfigDialogProps {
    transform: WizardTransformationStep;
    transformTypes: EnrichedTransformTypeOption[];
    operators: OperatorData | undefined;
    onSave: (config: Record<string, unknown>) => void;
    onClose: () => void;
}

export function TransformConfigDialog({
    transform,
    transformTypes,
    operators,
    onSave,
    onClose,
}: TransformConfigDialogProps) {
    const { t } = useLingui();
    const [localConfig, setLocalConfig] = useState<Record<string, unknown>>(transform.config);
    const handleSave = useCallback(() => {
        const cleaned = Object.fromEntries(
            Object.entries(localConfig).filter(([key, value]) => (
                !key.startsWith('_') && value !== '' && value !== undefined && value !== null
            )),
        );
        onSave(cleaned);
    }, [localConfig, onSave]);
    const typeMeta = useMemo(
        () => transformTypes.find(type => type.id === transform.type),
        [transformTypes, transform.type],
    );
    const colors = getCategoryColor(typeMeta?.category ?? 'DATA');
    const IconComponent = resolveIconName(typeMeta?.icon ?? undefined);
    const fieldCount = operators?.find(operator => operator.code === transform.type)
        ?.schema?.fields?.length ?? 0;

    return (
        <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors.badge}`}>
                            {IconComponent
                                ? <IconComponent className="w-4.5 h-4.5" />
                                : <Settings className="w-4.5 h-4.5" />}
                        </div>
                        <div>
                            <DialogTitle className="text-base">
                                {t`Configure ${typeMeta?.label ?? transform.type}`}
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
                                {fieldCount === 1
                                    ? t`${fieldCount} configuration field available`
                                    : t`${fieldCount} configuration fields available`}
                            </p>
                        </div>
                    )}
                </DialogHeader>
                <div className="space-y-4 py-1">
                    <TransformConfigFields
                        type={transform.type}
                        config={localConfig}
                        onUpdate={setLocalConfig}
                        operators={operators}
                    />
                </div>
                <Separator />
                <DialogFooter className="pt-2">
                    <Button variant="outline" onClick={onClose}>
                        <Trans>Cancel</Trans>
                    </Button>
                    <Button onClick={handleSave}>
                        <Trans>Save configuration</Trans>
                    </Button>
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
    const operator = operators?.find(candidate => candidate.code === type);
    const schema = useMemo(() => mapAdapterSchema(operator?.schema), [operator?.schema]);

    if (type === 'map') return <AdvancedMapEditor config={config} onChange={onUpdate} />;
    if (type === 'template') return <AdvancedTemplateEditor config={config} onChange={onUpdate} />;
    if (type === 'filter' || type === 'when') {
        return <AdvancedWhenEditor config={config} onChange={onUpdate} />;
    }
    if (schema?.fields?.length) {
        return (
            <SchemaFormRenderer
                schema={schema}
                values={config}
                onChange={onUpdate}
                compact
            />
        );
    }

    const configInputId = 'import-transform-configuration-json';
    return (
        <div className="space-y-2">
            <Label htmlFor={configInputId} className="text-sm font-medium">
                <Trans>Configuration (JSON)</Trans>
            </Label>
            <Textarea
                id={configInputId}
                value={JSON.stringify(config, null, 2)}
                onChange={event => {
                    try {
                        onUpdate(JSON.parse(event.target.value));
                    } catch {
                        return;
                    }
                }}
                className="font-mono text-xs"
                rows={4}
            />
        </div>
    );
}
