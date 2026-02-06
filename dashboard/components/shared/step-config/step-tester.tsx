import * as React from 'react';
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
} from '@vendure/dashboard';
import { PlayIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { STEP_TYPES, ADAPTER_TYPES } from '../../../constants';
import { runStepTest, canTestStepType, type TestResult } from './step-test-handlers';
import { ExtractTestResults } from './ExtractTestResults';
import { TransformTestResults, ValidateTestResults } from './TransformTestResults';
import { LoadTestResults, FeedTestResults, GenericTestResults } from './LoadTestResults';

interface StepTesterProps {
    stepType: string;
    adapterType: string;
    config: Record<string, unknown>;
}

const DEFAULT_SAMPLE_DATA = `[
  { "id": "1", "sku": "SKU-001", "name": "Product One", "price": 99.99 },
  { "id": "2", "sku": "SKU-002", "name": "Product Two", "price": 149.99 }
]`;

function getEffectiveStepType(stepType: string, adapterType: string): string {
    const st = stepType?.toUpperCase() || '';
    if (st === STEP_TYPES.EXTRACT || adapterType === ADAPTER_TYPES.EXTRACTOR) return STEP_TYPES.EXTRACT;
    if (st === STEP_TYPES.TRANSFORM) return STEP_TYPES.TRANSFORM;
    if (st === STEP_TYPES.VALIDATE) return STEP_TYPES.VALIDATE;
    if (st === STEP_TYPES.LOAD || adapterType === ADAPTER_TYPES.LOADER) return STEP_TYPES.LOAD;
    if (st === STEP_TYPES.FEED || adapterType === ADAPTER_TYPES.FEED) return STEP_TYPES.FEED;
    if (st === STEP_TYPES.EXPORT || adapterType === ADAPTER_TYPES.EXPORTER) return STEP_TYPES.EXPORT;
    if (st === STEP_TYPES.SINK || adapterType === ADAPTER_TYPES.SINK) return STEP_TYPES.SINK;
    if (st === STEP_TYPES.TRIGGER) return STEP_TYPES.TRIGGER;
    return st || 'UNKNOWN';
}

export function StepTester({ stepType, adapterType, config }: StepTesterProps) {
    const [expanded, setExpanded] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [result, setResult] = React.useState<TestResult | null>(null);
    const [sampleInput, setSampleInput] = React.useState(DEFAULT_SAMPLE_DATA);
    const [limit, setLimit] = React.useState(10);
    const [resultView, setResultView] = React.useState<'table' | 'json'>('table');

    const effectiveType = getEffectiveStepType(stepType, adapterType);
    const canTest = canTestStepType(effectiveType);

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

    const runTest = React.useCallback(async () => {
        setLoading(true);
        setResult(null);
        const testResult = await runStepTest(effectiveType, { config: configRef.current, sampleInput, limit });
        setResult(testResult);
        setLoading(false);
    }, [effectiveType, sampleInput, limit]);

    const renderInputSection = () => {
        if (effectiveType === STEP_TYPES.EXTRACT || effectiveType === STEP_TYPES.FEED) {
            return (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Label className="text-xs">Record limit</Label>
                        <Input type="number" value={limit} onChange={e => setLimit(Math.max(1, parseInt(e.target.value) || 10))} className="w-20 h-8" min={1} max={100} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {effectiveType === STEP_TYPES.EXTRACT ? 'Extracts data using the configured adapter and returns sample records.' : 'Generates feed output using the configured feed adapter.'}
                    </p>
                </div>
            );
        }
        if ([STEP_TYPES.TRANSFORM, STEP_TYPES.VALIDATE, STEP_TYPES.LOAD].includes(effectiveType as typeof STEP_TYPES[keyof typeof STEP_TYPES])) {
            const descriptions = { [STEP_TYPES.TRANSFORM]: 'Applies configured transformations to these records.', [STEP_TYPES.VALIDATE]: 'Runs validation rules on these records.', [STEP_TYPES.LOAD]: 'Simulates loading these records (no actual database changes).' };
            return (
                <div className="space-y-2">
                    <Label className="text-xs">Sample Input Records (JSON Array)</Label>
                    <Textarea value={sampleInput} onChange={e => setSampleInput(e.target.value)} className="font-mono text-xs min-h-[100px]" placeholder="Enter JSON array of records..." />
                    <p className="text-xs text-muted-foreground">{descriptions[effectiveType as keyof typeof descriptions]}</p>
                </div>
            );
        }
        return <p className="text-xs text-muted-foreground">This step type does not support direct testing.</p>;
    };

    const renderResults = () => {
        if (!result) return null;
        switch (effectiveType) {
            case STEP_TYPES.EXTRACT:
                return <ExtractTestResults result={result} resultView={resultView} onViewChange={setResultView} />;
            case STEP_TYPES.TRANSFORM:
                return <TransformTestResults result={result} resultView={resultView} onViewChange={setResultView} />;
            case STEP_TYPES.VALIDATE:
                return <ValidateTestResults result={result} resultView={resultView} onViewChange={setResultView} />;
            case STEP_TYPES.LOAD:
                return <LoadTestResults result={result} />;
            case STEP_TYPES.FEED:
                return <FeedTestResults result={result} />;
            default:
                return <GenericTestResults result={result} />;
        }
    };

    return (
        <Card className="mt-4" data-testid="datahub-steptester-tester">
            <CardHeader className="py-2 px-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-sm">Step Tester</CardTitle>
                        <Badge variant="outline" className="text-xs">{effectiveType}</Badge>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="h-7 px-2">
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
                                {loading ? 'Running...' : 'Run Test'}
                            </Button>
                            {renderResults()}
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {effectiveType === STEP_TYPES.TRIGGER ? 'Trigger steps define when pipelines run. Use the full pipeline dry run to test execution.' : `${effectiveType} steps cannot be tested individually. Use the full pipeline dry run.`}
                        </p>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
