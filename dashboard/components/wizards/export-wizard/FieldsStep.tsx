import { useCallback } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Card,
    CardContent,
    Input,
    Badge,
    Switch,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    ScrollArea,
} from '@vendure/dashboard';
import { WizardStepContainer } from '../shared';
import {
    COMPONENT_HEIGHTS,
    SENTINEL_VALUES,
} from '../../../constants';
import { useFieldTransformTypes } from '../../../hooks/api/use-config-options';
import type { ConfigOptionValue } from '../../../hooks/api/use-config-options';
import type { ExportConfiguration, ExportField } from './types';

interface FieldsStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

export function FieldsStep({ config, updateConfig }: FieldsStepProps) {
    const { t } = useLingui();
    const { options: transformTypes } = useFieldTransformTypes();
    const supportedTransformTypes = transformTypes.filter((option) =>
        ['trim', 'lowercase', 'uppercase', 'stripHtml'].includes(option.value),
    );
    const fields = config.fields ?? [];

    const toggleField = useCallback(
        (index: number) => {
            const currentFields = config.fields ?? [];
            const newFields = [...currentFields];
            newFields[index] = {
                ...newFields[index],
                include: !newFields[index].include,
            };
            updateConfig({ fields: newFields });
        },
        [config.fields, updateConfig],
    );

    const updateField = useCallback(
        (index: number, updates: Partial<ExportField>) => {
            const currentFields = config.fields ?? [];
            const newFields = [...currentFields];
            newFields[index] = { ...newFields[index], ...updates };
            updateConfig({ fields: newFields });
        },
        [config.fields, updateConfig],
    );

    const selectAll = useCallback(() => {
        const currentFields = config.fields ?? [];
        updateConfig({
            fields: currentFields.map((f) => ({ ...f, include: true })),
        });
    }, [config.fields, updateConfig]);

    const deselectAll = useCallback(() => {
        const currentFields = config.fields ?? [];
        updateConfig({
            fields: currentFields.map((f) => ({ ...f, include: false })),
        });
    }, [config.fields, updateConfig]);

    const selectedCount = fields.filter((f) => f.include).length;

    return (
        <WizardStepContainer
            title={t`Select Fields`}
            description={t`Choose which fields to include in the export`}
        >
            <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge variant="secondary">
                    {t`${selectedCount} of ${fields.length} selected`}
                </Badge>
                <Button variant="outline" size="sm" onClick={selectAll}>
                    <Trans>Select All</Trans>
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                    <Trans>Deselect All</Trans>
                </Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="hidden grid-cols-12 gap-4 bg-muted p-4 text-sm font-medium md:grid">
                        <div className="col-span-1">
                            <Trans>Include</Trans>
                        </div>
                        <div className="col-span-4">
                            <Trans>Source Field</Trans>
                        </div>
                        <div className="col-span-4">
                            <Trans>Output Name</Trans>
                        </div>
                        <div className="col-span-3">
                            <Trans>Transform</Trans>
                        </div>
                    </div>

                    <ScrollArea className={COMPONENT_HEIGHTS.WIZARD_PANE_MD}>
                        <div className="divide-y">
                            {fields.map((field, index) => (
                                <FieldRow
                                    key={field.sourceField}
                                    field={field}
                                    transformTypes={supportedTransformTypes}
                                    onToggle={() => toggleField(index)}
                                    onUpdate={(updates) =>
                                        updateField(index, updates)
                                    }
                                />
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </WizardStepContainer>
    );
}

interface FieldRowProps {
    field: ExportField;
    transformTypes: ConfigOptionValue[];
    onToggle: () => void;
    onUpdate: (updates: Partial<ExportField>) => void;
}

function FieldRow({
    field,
    transformTypes,
    onToggle,
    onUpdate,
}: FieldRowProps) {
    const { t } = useLingui();
    return (
        <div
            className={`grid grid-cols-1 items-center gap-4 p-4 md:grid-cols-12 ${
                !field.include ? 'opacity-50' : ''
            }`}
        >
            <div className="flex items-center justify-between md:col-span-1 md:block">
                <span className="text-xs font-medium md:hidden">
                    <Trans>Include</Trans>
                </span>
                <Switch
                    checked={field.include}
                    aria-label={t`Include ${field.sourceField} in export`}
                    onCheckedChange={onToggle}
                />
            </div>

            <div className="md:col-span-4">
                <span className="mb-1 block text-xs font-medium md:hidden">
                    <Trans>Source Field</Trans>
                </span>
                <code className="text-sm font-mono">{field.sourceField}</code>
            </div>

            <div className="md:col-span-4">
                <span className="mb-1 block text-xs font-medium md:hidden">
                    <Trans>Output Name</Trans>
                </span>
                <Input
                    value={field.outputName}
                    onChange={(e) => onUpdate({ outputName: e.target.value })}
                    aria-label={t`Output name for ${field.sourceField}`}
                    disabled={!field.include}
                    className="font-mono"
                />
            </div>

            <div className="md:col-span-3">
                <span className="mb-1 block text-xs font-medium md:hidden">
                    <Trans>Transform</Trans>
                </span>
                <Select
                    value={field.transformation ?? SENTINEL_VALUES.NONE}
                    onValueChange={(transformation) => {
                        if (transformation == null) return;
                        onUpdate({
                            transformation:
                                transformation === SENTINEL_VALUES.NONE
                                    ? undefined
                                    : transformation,
                        });
                    }}
                    disabled={!field.include}
                >
                    <SelectTrigger
                        aria-label={t`Transformation for ${field.sourceField}`}
                    >
                        <SelectValue
                            placeholder={t`None`}
                        />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={SENTINEL_VALUES.NONE}>
                            <Trans>None</Trans>
                        </SelectItem>
                        {transformTypes.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
