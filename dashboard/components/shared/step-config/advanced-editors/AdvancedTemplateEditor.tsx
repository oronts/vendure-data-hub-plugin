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
import { InsertPathButton } from './PathControls';
import {
    collectPaths,
    isSafeObjectPath,
    parseRecord,
    renderTemplate,
    TEMPLATE_SAMPLE,
} from './editor-utils';
import type { JsonRecord, TemplateEditorConfig } from './types';

interface AdvancedTemplateEditorProps {
    config: JsonRecord;
    onChange: (values: JsonRecord) => void;
}

export function AdvancedTemplateEditor({
    config,
    onChange,
}: AdvancedTemplateEditorProps) {
    const { t } = useLingui();
    const typedConfig = config as TemplateEditorConfig;
    const configTemplate = typedConfig.template ?? '';
    const configTarget = typedConfig.target ?? '';
    const configMissingAsEmpty = typedConfig.missingAsEmpty === true;
    const [sample, setSample] = React.useState(TEMPLATE_SAMPLE);
    const [template, setTemplate] = React.useState(configTemplate);
    const [target, setTarget] = React.useState(configTarget);
    const [missingAsEmpty, setMissingAsEmpty] = React.useState(configMissingAsEmpty);
    const [helpOpen, setHelpOpen] = React.useState(false);
    const templateRef = React.useRef<HTMLTextAreaElement>(null);
    const fieldIdPrefix = React.useId();
    const templateId = `${fieldIdPrefix}-template`;
    const templateErrorId = `${fieldIdPrefix}-template-error`;
    const targetId = `${fieldIdPrefix}-target`;
    const targetErrorId = `${fieldIdPrefix}-target-error`;
    const sampleId = `${fieldIdPrefix}-sample`;
    const sampleErrorId = `${fieldIdPrefix}-sample-error`;
    const missingAsEmptyId = `${fieldIdPrefix}-missing-as-empty`;
    const helpId = `${fieldIdPrefix}-help`;

    React.useEffect(() => setTemplate(configTemplate), [configTemplate]);
    React.useEffect(() => setTarget(configTarget), [configTarget]);
    React.useEffect(
        () => setMissingAsEmpty(configMissingAsEmpty),
        [configMissingAsEmpty],
    );

    const sampleRecord = React.useMemo(() => parseRecord(sample), [sample]);
    const paths = React.useMemo(
        () => sampleRecord ? collectPaths(sampleRecord) : [],
        [sampleRecord],
    );
    const rendered = React.useMemo(
        () => sampleRecord ? renderTemplate(sampleRecord, template, missingAsEmpty) : '',
        [missingAsEmpty, sampleRecord, template],
    );
    const trimmedTarget = target.trim();
    const templateValid = template.length > 0;
    const targetValid = isSafeObjectPath(trimmedTarget);
    const count = template.length;

    const handleApply = React.useCallback(() => {
        if (!templateValid || !targetValid) return;
        onChange({
            ...config,
            template,
            target: trimmedTarget,
            missingAsEmpty,
        });
    }, [config, missingAsEmpty, onChange, targetValid, template, templateValid, trimmedTarget]);

    const insertPath = React.useCallback((path: string) => {
        const insertion = `\${${path}}`;
        const textarea = templateRef.current;
        if (!textarea) {
            setTemplate(current => current + insertion);
            return;
        }
        const start = textarea.selectionStart ?? template.length;
        const end = textarea.selectionEnd ?? start;
        setTemplate(template.slice(0, start) + insertion + template.slice(end));
        requestAnimationFrame(() => {
            textarea.focus();
            const position = start + insertion.length;
            textarea.setSelectionRange(position, position);
        });
    }, [template]);

    return (
        <Card data-testid="datahub-advanced-template-editor">
            <CardHeader className="py-3">
                <CardTitle className="text-sm"><Trans>Advanced: Template Editor</Trans></CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] text-muted-foreground">
                        <Trans>Render strings with $&#123;path&#125; placeholders and write them to the target path.</Trans>
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
                            <li><Trans>Use $&#123;field&#125; or $&#123;nested.path&#125; inside the template.</Trans></li>
                            <li><Trans>Click a field under Quick insert to add it at the cursor.</Trans></li>
                            <li><Trans>The rendered value is written to the target path.</Trans></li>
                        </ul>
                    </div>
                )}
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor={templateId} className="text-xs font-medium">
                                <Trans>Template</Trans>
                                <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
                            </Label>
                            <span className="text-[10px] text-muted-foreground">{t`${count} characters`}</span>
                        </div>
                        <Textarea
                            id={templateId}
                            ref={templateRef}
                            className="min-h-[100px] font-mono text-xs"
                            value={template}
                            onChange={event => setTemplate(event.target.value)}
                            aria-required="true"
                            aria-invalid={!templateValid}
                            aria-describedby={!templateValid ? templateErrorId : undefined}
                        />
                        {!templateValid && (
                            <p id={templateErrorId} role="alert" className="text-[11px] text-destructive">
                                <Trans>Template is required.</Trans>
                            </p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                            <Trans>Use $&#123;path&#125; placeholders, for example $&#123;name&#125; or $&#123;category.code&#125;.</Trans>
                        </p>
                        <Label htmlFor={targetId} className="text-xs font-medium">
                            <Trans>Target path</Trans>
                            <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>
                        </Label>
                        <Input
                            id={targetId}
                            value={target}
                            onChange={event => setTarget(event.target.value)}
                            placeholder={t`Target field path`}
                            aria-required="true"
                            aria-invalid={!targetValid}
                            aria-describedby={!targetValid ? targetErrorId : undefined}
                        />
                        {!targetValid && (
                            <p id={targetErrorId} role="alert" className="text-[11px] text-destructive">
                                <Trans>Enter a valid target path.</Trans>
                            </p>
                        )}
                        <div className="flex items-center gap-2">
                            <Switch
                                id={missingAsEmptyId}
                                checked={missingAsEmpty}
                                onCheckedChange={setMissingAsEmpty}
                            />
                            <Label htmlFor={missingAsEmptyId} className="text-xs font-normal">
                                <Trans>Treat missing fields as empty strings</Trans>
                            </Label>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleApply}
                            disabled={!templateValid || !targetValid}
                        >
                            <Trans>Apply</Trans>
                        </Button>
                    </div>
                    <div>
                        <Label htmlFor={sampleId} className="text-xs font-medium">
                            <Trans>Sample record (JSON)</Trans>
                        </Label>
                        <Textarea
                            id={sampleId}
                            className="min-h-[120px] font-mono text-xs"
                            value={sample}
                            onChange={event => setSample(event.target.value)}
                            aria-invalid={!sampleRecord}
                            aria-describedby={!sampleRecord ? sampleErrorId : undefined}
                        />
                        {!sampleRecord && (
                            <p id={sampleErrorId} role="alert" className="mt-1 text-[11px] text-destructive">
                                <Trans>Enter a valid JSON object.</Trans>
                            </p>
                        )}
                        {paths.length > 0 && (
                            <div className="mt-2">
                                <h4 className="text-xs font-medium"><Trans>Quick insert</Trans></h4>
                                <div className="max-h-28 overflow-auto rounded border p-2">
                                    {paths.map(path => (
                                        <InsertPathButton key={path} path={path} onInsert={insertPath} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div>
                    <h4 className="text-xs font-medium"><Trans>Preview</Trans></h4>
                    <div className="rounded border bg-muted/50 p-2">
                        <pre className="break-all whitespace-pre-wrap text-[11px] leading-tight" aria-live="polite">
                            {rendered}
                        </pre>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
