import { useCallback, memo } from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
} from '@vendure/dashboard';
import { CSV_DELIMITERS, FILE_ENCODINGS, EXPORT_FORMAT, XML_DEFAULTS, DEFAULT_ENCODING } from '../../../constants';
import { WizardStepContainer } from '../shared';
import { SelectableCard, SelectableCardGrid } from '../../shared/selectable-card';
import { FEED_TEMPLATES, STEP_CONTENT, PLACEHOLDERS } from './constants';
import type { ExportConfiguration, FormatType } from './types';

interface FormatStepProps {
    config: Partial<ExportConfiguration>;
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
    errors?: Record<string, string>;
}

export function FormatStep({ config, updateConfig, errors = {} }: FormatStepProps) {
    const format = config.format ?? { type: EXPORT_FORMAT.CSV, options: {} };

    return (
        <WizardStepContainer
            title={STEP_CONTENT.format.title}
            description={STEP_CONTENT.format.description}
        >
            <FormatTemplateSelection format={format} updateConfig={updateConfig} />
            <FormatOptionsCard format={format} updateConfig={updateConfig} />
        </WizardStepContainer>
    );
}

interface FormatTemplateSelectionProps {
    format: ExportConfiguration['format'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function FormatTemplateSelection({ format, updateConfig }: FormatTemplateSelectionProps) {
    return (
        <SelectableCardGrid columns={3}>
            {FEED_TEMPLATES.map(template => (
                <FormatTemplateCard
                    key={template.id}
                    template={template}
                    format={format}
                    updateConfig={updateConfig}
                />
            ))}
        </SelectableCardGrid>
    );
}

interface FormatTemplateCardProps {
    template: typeof FEED_TEMPLATES[number];
    format: ExportConfiguration['format'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

const FormatTemplateCard = memo(function FormatTemplateCard({
    template,
    format,
    updateConfig,
}: FormatTemplateCardProps) {
    const isSelected = format.type === template.id ||
        (template.id.startsWith('custom-') && format.type === template.format);

    const handleClick = useCallback(() => {
        updateConfig({
            format: {
                type: template.id as FormatType,
                options: {
                    ...format.options,
                    feedTemplate: template.id.startsWith('custom-') ? undefined : template.id,
                },
            },
        });
    }, [template.id, format.options, updateConfig]);

    return (
        <SelectableCard
            icon={template.icon}
            title={template.name}
            description={template.description}
            selected={isSelected}
            onClick={handleClick}
            data-testid={`datahub-export-format-${template.id}-btn`}
        />
    );
});

interface FormatOptionsCardProps {
    format: ExportConfiguration['format'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function FormatOptionsCard({ format, updateConfig }: FormatOptionsCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Format Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {(format.type === EXPORT_FORMAT.CSV || format.type === EXPORT_FORMAT.META_CATALOG) && (
                    <CsvOptions format={format} updateConfig={updateConfig} />
                )}

                {format.type === EXPORT_FORMAT.JSON && (
                    <JsonOptions format={format} updateConfig={updateConfig} />
                )}

                {(format.type === EXPORT_FORMAT.XML || format.type === EXPORT_FORMAT.GOOGLE_SHOPPING || format.type === EXPORT_FORMAT.AMAZON) && (
                    <XmlOptions format={format} updateConfig={updateConfig} />
                )}
            </CardContent>
        </Card>
    );
}

interface OptionsProps {
    format: ExportConfiguration['format'];
    updateConfig: (updates: Partial<ExportConfiguration>) => void;
}

function CsvOptions({ format, updateConfig }: OptionsProps) {
    return (
        <div className="grid grid-cols-2 gap-4">
            <div>
                <Label>Delimiter</Label>
                <Select
                    value={format.options.delimiter ?? ','}
                    onValueChange={delimiter => updateConfig({
                        format: { ...format, options: { ...format.options, delimiter } },
                    })}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CSV_DELIMITERS.map(delimiter => (
                            <SelectItem key={delimiter.value} value={delimiter.value}>
                                {delimiter.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div>
                <Label>Encoding</Label>
                <Select
                    value={format.options.encoding ?? DEFAULT_ENCODING}
                    onValueChange={encoding => updateConfig({
                        format: { ...format, options: { ...format.options, encoding } },
                    })}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {FILE_ENCODINGS.map(encoding => (
                            <SelectItem key={encoding.value} value={encoding.value}>
                                {encoding.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="flex items-center gap-3">
                <Switch
                    checked={format.options.includeHeaders ?? true}
                    onCheckedChange={includeHeaders => updateConfig({
                        format: { ...format, options: { ...format.options, includeHeaders } },
                    })}
                />
                <Label>Include header row</Label>
            </div>

            <div className="flex items-center gap-3">
                <Switch
                    checked={format.options.quoteAll ?? false}
                    onCheckedChange={quoteAll => updateConfig({
                        format: { ...format, options: { ...format.options, quoteAll } },
                    })}
                />
                <Label>Quote all fields</Label>
            </div>
        </div>
    );
}

function JsonOptions({ format, updateConfig }: OptionsProps) {
    return (
        <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
                <Switch
                    checked={format.options.pretty ?? true}
                    onCheckedChange={pretty => updateConfig({
                        format: { ...format, options: { ...format.options, pretty } },
                    })}
                />
                <Label>Pretty print (formatted)</Label>
            </div>

            <div>
                <Label>Root Element</Label>
                <Input
                    value={format.options.rootElement ?? ''}
                    onChange={e => updateConfig({
                        format: { ...format, options: { ...format.options, rootElement: e.target.value } },
                    })}
                    placeholder={PLACEHOLDERS.jsonRoot}
                />
            </div>
        </div>
    );
}

function XmlOptions({ format, updateConfig }: OptionsProps) {
    return (
        <div className="grid grid-cols-2 gap-4">
            <div>
                <Label>Root Element</Label>
                <Input
                    value={format.options.xmlRoot ?? XML_DEFAULTS.ROOT_ELEMENT}
                    onChange={e => updateConfig({
                        format: { ...format, options: { ...format.options, xmlRoot: e.target.value } },
                    })}
                />
            </div>

            <div>
                <Label>Item Element</Label>
                <Input
                    value={format.options.xmlItem ?? XML_DEFAULTS.ITEM_ELEMENT}
                    onChange={e => updateConfig({
                        format: { ...format, options: { ...format.options, xmlItem: e.target.value } },
                    })}
                />
            </div>
        </div>
    );
}
