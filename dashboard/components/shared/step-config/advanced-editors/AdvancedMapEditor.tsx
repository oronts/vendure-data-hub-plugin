import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Switch,
    Textarea,
} from '@vendure/dashboard';
import { PathButton } from './PathControls';
import {
    collectPaths,
    MAP_SAMPLE,
    parseMapping,
    parseRecordArray,
    previewMapping,
    stringifyJson,
} from './editor-utils';
import type { JsonRecord, MapEditorConfig } from './types';

interface AdvancedMapEditorProps {
    config: JsonRecord;
    onChange: (values: JsonRecord) => void;
}

export function AdvancedMapEditor({ config, onChange }: AdvancedMapEditorProps) {
    const { t } = useLingui();
    const typedConfig = config as MapEditorConfig;
    const configMappingText = stringifyJson(typedConfig.mapping ?? {});
    const configPassthrough = typedConfig.passthrough === true;
    const [sample, setSample] = React.useState(MAP_SAMPLE);
    const [mappingText, setMappingText] = React.useState(configMappingText);
    const [passthrough, setPassthrough] = React.useState(configPassthrough);
    const [selectedPath, setSelectedPath] = React.useState('');
    const [destinationKey, setDestinationKey] = React.useState('');
    const [helpOpen, setHelpOpen] = React.useState(false);
    const fieldIdPrefix = React.useId();
    const mappingId = `${fieldIdPrefix}-mapping`;
    const mappingErrorId = `${fieldIdPrefix}-mapping-error`;
    const sampleId = `${fieldIdPrefix}-sample`;
    const sampleErrorId = `${fieldIdPrefix}-sample-error`;
    const destinationId = `${fieldIdPrefix}-destination`;
    const passthroughId = `${fieldIdPrefix}-passthrough`;
    const helpId = `${fieldIdPrefix}-help`;

    React.useEffect(() => setMappingText(configMappingText), [configMappingText]);
    React.useEffect(() => setPassthrough(configPassthrough), [configPassthrough]);

    const mapping = React.useMemo(() => parseMapping(mappingText), [mappingText]);
    const sampleRecords = React.useMemo(() => parseRecordArray(sample), [sample]);
    const result = React.useMemo(
        () => mapping && sampleRecords
            ? previewMapping(sampleRecords, mapping, passthrough)
            : [],
        [mapping, passthrough, sampleRecords],
    );
    const firstRecord = sampleRecords?.[0];
    const pathList = React.useMemo(
        () => firstRecord ? collectPaths(firstRecord) : [],
        [firstRecord],
    );

    const handleApply = React.useCallback(() => {
        if (!mapping) return;
        onChange({ ...config, mapping, passthrough });
    }, [config, mapping, onChange, passthrough]);

    const handleAddMapping = React.useCallback(() => {
        const target = destinationKey.trim();
        if (!mapping || !selectedPath || !target) return;
        setMappingText(stringifyJson({ ...mapping, [target]: selectedPath }));
        setDestinationKey('');
    }, [destinationKey, mapping, selectedPath]);

    return (
        <Card data-testid="datahub-advanced-map-editor">
            <CardHeader className="py-3">
                <CardTitle className="text-sm"><Trans>Advanced: Map Editor</Trans></CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] text-muted-foreground">
                        <Trans>Define &#123; dest: source.path &#125; pairs and preview the result.</Trans>
                    </p>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setHelpOpen(open => !open)}
                        aria-expanded={helpOpen}
                        aria-controls={helpId}
                    >
                        {helpOpen ? t`Hide help` : t`Help`}
                    </Button>
                </div>
                {helpOpen && (
                    <div id={helpId} className="rounded border bg-muted/30 p-2 text-[11px] text-muted-foreground">
                        <ul className="list-disc space-y-1 pl-4">
                            <li><Trans>The mapping is JSON: keys are destination fields and values are source paths.</Trans></li>
                            <li><Trans>Nested paths are supported, for example category.code.</Trans></li>
                            <li><Trans>The preview shows transformed records. Use Before and After to compare them.</Trans></li>
                        </ul>
                    </div>
                )}
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div>
                        <Label htmlFor={mappingId} className="text-xs font-medium">
                            <Trans>Mapping (JSON)</Trans>
                        </Label>
                        <Textarea
                            id={mappingId}
                            className="min-h-[140px] font-mono text-xs"
                            value={mappingText}
                            onChange={event => setMappingText(event.target.value)}
                            aria-invalid={!mapping}
                            aria-describedby={!mapping ? mappingErrorId : undefined}
                        />
                        {!mapping && (
                            <p id={mappingErrorId} role="alert" className="mt-1 text-[11px] text-destructive">
                                <Trans>Enter a valid JSON object for the mapping.</Trans>
                            </p>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                            <Switch
                                id={passthroughId}
                                checked={passthrough}
                                onCheckedChange={setPassthrough}
                            />
                            <Label htmlFor={passthroughId} className="text-xs font-normal">
                                <Trans>Include unmapped fields</Trans>
                            </Label>
                        </div>
                        <Button
                            className="mt-2"
                            variant="outline"
                            size="sm"
                            onClick={handleApply}
                            disabled={!mapping}
                        >
                            <Trans>Apply</Trans>
                        </Button>
                    </div>
                    <div>
                        <Label htmlFor={sampleId} className="text-xs font-medium">
                            <Trans>Sample input (JSON array)</Trans>
                        </Label>
                        <Textarea
                            id={sampleId}
                            className="min-h-[140px] font-mono text-xs"
                            value={sample}
                            onChange={event => setSample(event.target.value)}
                            aria-invalid={!sampleRecords}
                            aria-describedby={!sampleRecords ? sampleErrorId : undefined}
                        />
                        {!sampleRecords && (
                            <p id={sampleErrorId} role="alert" className="mt-1 text-[11px] text-destructive">
                                <Trans>Enter a valid JSON array of records.</Trans>
                            </p>
                        )}
                        {pathList.length > 0 && (
                            <div className="mt-2">
                                <h4 className="text-xs font-medium"><Trans>Field picker</Trans></h4>
                                <div className="max-h-32 overflow-auto rounded border p-2">
                                    <div className="grid grid-cols-1 gap-1">
                                        {pathList.map(path => (
                                            <PathButton
                                                key={path}
                                                path={path}
                                                isSelected={selectedPath === path}
                                                onSelect={setSelectedPath}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                    <Label htmlFor={destinationId} className="sr-only">
                                        <Trans>destination field</Trans>
                                    </Label>
                                    <Input
                                        id={destinationId}
                                        className="h-8"
                                        placeholder={t`destination field`}
                                        value={destinationKey}
                                        onChange={event => setDestinationKey(event.target.value)}
                                    />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleAddMapping}
                                        disabled={!mapping || !selectedPath || !destinationKey.trim()}
                                    >
                                        <Trans>Add mapping</Trans>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div>
                    <h4 className="text-xs font-medium"><Trans>Preview</Trans></h4>
                    <div className="max-h-48 overflow-auto rounded border bg-muted/50 p-2">
                        <pre className="break-all whitespace-pre-wrap text-[11px] leading-tight" aria-live="polite">
                            {stringifyJson(result)}
                        </pre>
                    </div>
                    {(!mapping || !sampleRecords) && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            <Trans>The preview may be empty until the mapping and sample are valid.</Trans>
                        </p>
                    )}
                </div>
                {firstRecord && result[0] && (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <div>
                            <h4 className="text-xs font-medium"><Trans>Before (first record)</Trans></h4>
                            <div className="max-h-48 overflow-auto rounded border bg-muted/30 p-2">
                                <pre className="break-all whitespace-pre-wrap text-[11px] leading-tight">
                                    {stringifyJson(firstRecord)}
                                </pre>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-xs font-medium"><Trans>After (first mapped record)</Trans></h4>
                            <div className="max-h-48 overflow-auto rounded border bg-muted/30 p-2">
                                <pre className="break-all whitespace-pre-wrap text-[11px] leading-tight">
                                    {stringifyJson(result[0])}
                                </pre>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
