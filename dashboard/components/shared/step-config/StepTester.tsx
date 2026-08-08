import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Trans, useLingui } from '@lingui/react/macro';
import { toast } from 'sonner';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Textarea,
    Badge,
    PermissionGuard,
} from '@vendure/dashboard';
import { PlayIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { STEP_TYPE, ADAPTER_TYPES, DEFAULT_SAMPLE_DATA, PLACEHOLDERS, UI_LIMITS } from '../../../constants';
import { getErrorMessage } from '../../../../shared';
import { runStepTest, canTestStepType, type TestResult, type StepTestOptions } from './step-test-handlers';
import { ExtractTestResults } from './ExtractTestResults';
import { TransformTestResults, ValidateTestResults } from './TransformTestResults';
import { LoadTestResults, GenericTestResults } from './LoadTestResults';
import { DATAHUB_PERMISSIONS } from '../../../constants';

const INPUT_STEP_TYPES: ReadonlySet<string> = new Set([
    STEP_TYPE.TRANSFORM,
    STEP_TYPE.VALIDATE,
    STEP_TYPE.LOAD,
]);

interface StepTesterProps {
    stepType: string;
    adapterType: string;
    config: Record<string, unknown>;
    schemaRef?: { schemaId: string; version: string };
}

function getEffectiveStepType(stepType: string, adapterType: string): string {
    const st = stepType?.toUpperCase() || '';
    if (st === STEP_TYPE.EXTRACT || adapterType === ADAPTER_TYPES.EXTRACTOR) return STEP_TYPE.EXTRACT;
    if (st === STEP_TYPE.TRANSFORM) return STEP_TYPE.TRANSFORM;
    if (st === STEP_TYPE.VALIDATE) return STEP_TYPE.VALIDATE;
    if (st === STEP_TYPE.LOAD || adapterType === ADAPTER_TYPES.LOADER) return STEP_TYPE.LOAD;
    if (st === STEP_TYPE.FEED || adapterType === ADAPTER_TYPES.FEED) return STEP_TYPE.FEED;
    if (st === STEP_TYPE.EXPORT || adapterType === ADAPTER_TYPES.EXPORTER) return STEP_TYPE.EXPORT;
    if (st === STEP_TYPE.SINK || adapterType === ADAPTER_TYPES.SINK) return STEP_TYPE.SINK;
    if (st === STEP_TYPE.TRIGGER) return STEP_TYPE.TRIGGER;
    if (st === STEP_TYPE.ENRICH) return STEP_TYPE.ENRICH;
    if (st === STEP_TYPE.ROUTE) return STEP_TYPE.ROUTE;
    if (st === STEP_TYPE.GATE) return STEP_TYPE.GATE;
    return st || 'UNKNOWN';
}

export function StepTester({ stepType, adapterType, config, schemaRef }: StepTesterProps) {
    const { t } = useLingui();
    const [expanded, setExpanded] = React.useState(false);
    const [result, setResult] = React.useState<TestResult | null>(null);
    const [sampleInput, setSampleInput] = React.useState(DEFAULT_SAMPLE_DATA);
    const [limit, setLimit] = React.useState<number>(UI_LIMITS.PREVIEW_ROW_LIMIT);
    const [resultView, setResultView] = React.useState<'table' | 'json'>('table');
    const fieldIdPrefix = React.useId();
    const limitId = `${fieldIdPrefix}-limit`;
    const sampleInputId = `${fieldIdPrefix}-sample-input`;

    const effectiveType = getEffectiveStepType(stepType, adapterType);
    const canTest = canTestStepType(effectiveType);

    const stepTestMutation = useMutation({
        mutationFn: ({ type, options }: { type: string; options: StepTestOptions }) =>
            runStepTest(type, options),
        onSuccess: (data) => setResult(data),
        onError: error => toast.error(
            t`Step test failed`,
            { description: getErrorMessage(error) },
        ),
    });
    const { mutate: testStep } = stepTestMutation;
    const loading = stepTestMutation.isPending;

    // Use JSON serialization to detect actual config changes, not just reference changes
    const configSignature = React.useMemo(() => JSON.stringify(config), [config]);

    React.useEffect(() => {
        setResult(null);
    }, [configSignature, stepType, adapterType]);

    // Store config in ref to use latest value without triggering callback recreation
    const configRef = React.useRef(config);
    React.useEffect(() => {
        configRef.current = config;
    }, [config]);

    const runTest = React.useCallback(() => {
        setResult(null);
        testStep({
            type: effectiveType,
            options: { config: configRef.current, schemaRef, sampleInput, limit },
        });
    }, [effectiveType, schemaRef, sampleInput, limit, testStep]);

    const renderInputSection = () => {
        if (effectiveType === STEP_TYPE.EXTRACT || effectiveType === STEP_TYPE.FEED) {
            return (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Label htmlFor={limitId} className="text-xs">
                            <Trans>Record limit</Trans>
                        </Label>
                        <Input
                            id={limitId}
                            type="number"
                            value={limit}
                            onChange={event => setLimit(Math.min(
                                UI_LIMITS.MAX_PREVIEW_ROWS,
                                Math.max(
                                    1,
                                    Number.parseInt(event.target.value, 10)
                                        || UI_LIMITS.PREVIEW_ROW_LIMIT,
                                ),
                            ))}
                            className="w-20 h-8"
                            min={1}
                            max={UI_LIMITS.MAX_PREVIEW_ROWS}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {effectiveType === STEP_TYPE.EXTRACT
                            ? t`Extracts sample records using the configured extractor.`
                            : t`Generates feed output using the configured feed adapter.`}
                    </p>
                </div>
            );
        }
        if (INPUT_STEP_TYPES.has(effectiveType)) {
            return (
                <div className="space-y-2">
                    <Label htmlFor={sampleInputId} className="text-xs">
                        <Trans>Sample input records (JSON array)</Trans>
                    </Label>
                    <Textarea id={sampleInputId} value={sampleInput} onChange={e => setSampleInput(e.target.value)} className="font-mono text-xs min-h-[100px]" placeholder={PLACEHOLDERS.SAMPLE_RECORDS} />
                    <p className="text-xs text-muted-foreground">
                        {effectiveType === STEP_TYPE.TRANSFORM
                            ? t`Applies the configured transformations to the sample records.`
                            : effectiveType === STEP_TYPE.VALIDATE
                                ? t`Validates the sample records using the configured rules.`
                                : t`Simulates loading the sample records without changing the database.`}
                    </p>
                </div>
            );
        }
        return (
            <p className="text-xs text-muted-foreground">
                <Trans>This step type does not support direct testing.</Trans>
            </p>
        );
    };

    const renderResults = () => {
        if (!result) return null;
        switch (effectiveType) {
            case STEP_TYPE.EXTRACT:
                return <ExtractTestResults result={result} resultView={resultView} onViewChange={setResultView} />;
            case STEP_TYPE.TRANSFORM:
                return <TransformTestResults result={result} resultView={resultView} onViewChange={setResultView} />;
            case STEP_TYPE.VALIDATE:
                return <ValidateTestResults result={result} resultView={resultView} onViewChange={setResultView} />;
            case STEP_TYPE.LOAD:
                return <LoadTestResults result={result} />;
            default:
                return <GenericTestResults result={result} />;
        }
    };

    return (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.RUN_PIPELINE]}>
            <Card className="mt-4" data-testid="datahub-steptester-tester">
            <CardHeader className="py-2 px-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-sm">
                            <Trans>Step tester</Trans>
                        </CardTitle>
                        <Badge variant="outline" className="text-xs">{effectiveType}</Badge>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="h-7 px-2" aria-label={t`Toggle test panel`}>
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>
            </CardHeader>
            {expanded && (
                <CardContent className="pt-0 pb-3 px-3 space-y-3">
                    {canTest ? (
                        <>
                            {renderInputSection()}
                            <Button onClick={runTest} disabled={loading} size="sm" className="gap-2" data-testid="datahub-steptester-run">
                                <PlayIcon className="h-3 w-3" />
                                {loading ? t`Running...` : t`Run test`}
                            </Button>
                            {renderResults()}
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {effectiveType === STEP_TYPE.TRIGGER
                                ? t`Trigger steps define when pipelines run. Use the full pipeline dry run to test execution.`
                                : t`${effectiveType} steps cannot be tested individually. Use the full pipeline dry run.`}
                        </p>
                    )}
                </CardContent>
            )}
            </Card>
        </PermissionGuard>
    );
}
