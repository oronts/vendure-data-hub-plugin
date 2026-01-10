/**
 * Step Tester Component
 *
 * Provides step-by-step testing for pipeline steps:
 * - EXTRACT: Run extractor and preview records
 * - TRANSFORM: Apply transforms to sample data and show before/after
 * - VALIDATE: Run validation rules on sample data
 * - LOAD: Simulate loader to show what would be created/updated
 * - FEED: Preview feed output (XML/JSON)
 * - EXPORT: Preview export output
 */
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
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@vendure/dashboard';
import { api } from '@vendure/dashboard';
import { graphql } from '@/gql';
import { PlayIcon, AlertCircle, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

// GraphQL mutations for step testing
const previewExtractMutation = graphql(`
    mutation TestPreviewExtract($step: JSON!, $limit: Int) {
        previewDataHubExtract(step: $step, limit: $limit) { records }
    }
`);

const simulateTransformMutation = graphql(`
    mutation TestSimulateTransform($step: JSON!, $records: JSON!) {
        simulateDataHubTransform(step: $step, records: $records)
    }
`);

const simulateLoadMutation = graphql(`
    mutation TestSimulateLoad($step: JSON!, $records: JSON!) {
        simulateDataHubLoad(step: $step, records: $records)
    }
`);

const simulateValidateMutation = graphql(`
    mutation TestSimulateValidate($step: JSON!, $records: JSON!) {
        simulateDataHubValidate(step: $step, records: $records) {
            records
            summary { input passed failed passRate }
        }
    }
`);

const previewFeedMutation = graphql(`
    mutation TestPreviewFeed($feedCode: String!, $limit: Int) {
        previewDataHubFeed(feedCode: $feedCode, limit: $limit) { content contentType itemCount }
    }
`);

// Types
interface StepTesterProps {
    stepType: string;
    adapterType: string;
    config: Record<string, unknown>;
}

interface TestResult {
    status: 'success' | 'error' | 'warning';
    message?: string;
    data?: unknown;
    records?: Array<Record<string, unknown>>;
    beforeAfter?: Array<{ before: Record<string, unknown>; after: Record<string, unknown> }>;
    feedContent?: { content: string; contentType: string; itemCount: number };
    loadSimulation?: Record<string, unknown>;
}

// Detect the effective step type from props
function getEffectiveStepType(stepType: string, adapterType: string): string {
    const st = stepType?.toUpperCase() || '';
    if (st === 'EXTRACT' || adapterType === 'extractor') return 'EXTRACT';
    if (st === 'TRANSFORM') return 'TRANSFORM';
    if (st === 'VALIDATE') return 'VALIDATE';
    if (st === 'LOAD' || adapterType === 'loader') return 'LOAD';
    if (st === 'FEED' || adapterType === 'feed') return 'FEED';
    if (st === 'EXPORT' || adapterType === 'exporter') return 'EXPORT';
    if (st === 'SINK' || adapterType === 'sink') return 'SINK';
    if (st === 'TRIGGER') return 'TRIGGER';
    return st || 'UNKNOWN';
}

// Default sample data for different step types
const DEFAULT_SAMPLE_DATA = `[
  { "id": "1", "sku": "SKU-001", "name": "Product One", "price": 99.99 },
  { "id": "2", "sku": "SKU-002", "name": "Product Two", "price": 149.99 }
]`;

export function StepTester({ stepType, adapterType, config }: StepTesterProps) {
    const [expanded, setExpanded] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [result, setResult] = React.useState<TestResult | null>(null);
    const [sampleInput, setSampleInput] = React.useState(DEFAULT_SAMPLE_DATA);
    const [limit, setLimit] = React.useState(10);
    const [resultView, setResultView] = React.useState<'table' | 'json'>('table');

    const effectiveType = getEffectiveStepType(stepType, adapterType);

    // Reset result when config changes
    React.useEffect(() => {
        setResult(null);
    }, [config, stepType, adapterType]);

    // Run the test based on step type
    const runTest = React.useCallback(async () => {
        setLoading(true);
        setResult(null);

        try {
            switch (effectiveType) {
                case 'EXTRACT': {
                    const res = await api.mutate(previewExtractMutation, {
                        step: config || {},
                        limit,
                    });
                    const records = res?.previewDataHubExtract?.records ?? [];
                    setResult({
                        status: records.length > 0 ? 'success' : 'warning',
                        message: records.length > 0
                            ? `Extracted ${records.length} record(s)`
                            : 'No records extracted. Check your extractor configuration.',
                        records: records as Array<Record<string, unknown>>,
                    });
                    break;
                }

                case 'TRANSFORM': {
                    let inputRecords: Array<Record<string, unknown>>;
                    try {
                        inputRecords = JSON.parse(sampleInput);
                        if (!Array.isArray(inputRecords)) {
                            throw new Error('Input must be a JSON array');
                        }
                    } catch (e) {
                        setResult({
                            status: 'error',
                            message: `Invalid sample input: ${e instanceof Error ? e.message : 'Parse error'}`,
                        });
                        break;
                    }

                    const res = await api.mutate(simulateTransformMutation, {
                        step: config || {},
                        records: inputRecords,
                    });
                    const outputRecords = (res?.simulateDataHubTransform ?? []) as Array<Record<string, unknown>>;

                    // Create before/after pairs
                    const beforeAfter = inputRecords.map((before, idx) => ({
                        before,
                        after: outputRecords[idx] ?? {},
                    }));

                    setResult({
                        status: 'success',
                        message: `Transformed ${inputRecords.length} record(s)`,
                        records: outputRecords,
                        beforeAfter,
                    });
                    break;
                }

                case 'VALIDATE': {
                    let inputRecords: Array<Record<string, unknown>>;
                    try {
                        inputRecords = JSON.parse(sampleInput);
                        if (!Array.isArray(inputRecords)) {
                            throw new Error('Input must be a JSON array');
                        }
                    } catch (e) {
                        setResult({
                            status: 'error',
                            message: `Invalid sample input: ${e instanceof Error ? e.message : 'Parse error'}`,
                        });
                        break;
                    }

                    const res = await api.mutate(simulateValidateMutation, {
                        step: config || {},
                        records: inputRecords,
                    });
                    const validateResult = res?.simulateDataHubValidate;
                    const outputRecords = (validateResult?.records ?? []) as Array<Record<string, unknown>>;
                    const summary = validateResult?.summary;

                    setResult({
                        status: summary?.failed ? 'warning' : 'success',
                        message: summary
                            ? `Validation: ${summary.passed}/${summary.input} passed (${summary.passRate}%)`
                            : `Validated ${outputRecords.length} record(s)`,
                        records: outputRecords,
                        data: summary ? { validationSummary: summary } : undefined,
                    });
                    break;
                }

                case 'LOAD': {
                    let inputRecords: Array<Record<string, unknown>>;
                    try {
                        inputRecords = JSON.parse(sampleInput);
                        if (!Array.isArray(inputRecords)) {
                            throw new Error('Input must be a JSON array');
                        }
                    } catch (e) {
                        setResult({
                            status: 'error',
                            message: `Invalid sample input: ${e instanceof Error ? e.message : 'Parse error'}`,
                        });
                        break;
                    }

                    const res = await api.mutate(simulateLoadMutation, {
                        step: config || {},
                        records: inputRecords,
                    });
                    const simulation = (res?.simulateDataHubLoad ?? {}) as Record<string, unknown>;

                    setResult({
                        status: 'success',
                        message: 'Load simulation completed',
                        loadSimulation: simulation,
                        records: inputRecords,
                    });
                    break;
                }

                case 'FEED': {
                    // Config may contain 'code' or 'feedCode' depending on the feed adapter
                    const feedConfig = config as { code?: string; feedCode?: string };
                    const feedCode = String(feedConfig.code || feedConfig.feedCode || '');
                    if (!feedCode) {
                        setResult({
                            status: 'error',
                            message: 'No feed code configured. Set the feed code in step configuration.',
                        });
                        break;
                    }

                    const res = await api.mutate(previewFeedMutation, { feedCode, limit });
                    const feed = res?.previewDataHubFeed;
                    if (feed) {
                        setResult({
                            status: 'success',
                            message: `Feed preview: ${feed.itemCount} item(s)`,
                            feedContent: {
                                content: feed.content ?? '',
                                contentType: feed.contentType ?? 'text/plain',
                                itemCount: feed.itemCount ?? 0,
                            },
                        });
                    } else {
                        setResult({
                            status: 'warning',
                            message: 'No feed content returned',
                        });
                    }
                    break;
                }

                case 'TRIGGER': {
                    // Trigger config typically has a 'type' field indicating the trigger mechanism
                    const triggerConfig = config as { type?: string };
                    setResult({
                        status: 'success',
                        message: 'Trigger steps cannot be tested directly. Run a full pipeline dry run instead.',
                        data: {
                            triggerType: triggerConfig.type || 'unknown',
                            config: config,
                        },
                    });
                    break;
                }

                case 'EXPORT':
                case 'SINK': {
                    setResult({
                        status: 'success',
                        message: `${effectiveType} steps write to external destinations. Use the full pipeline dry run to test.`,
                        data: { config },
                    });
                    break;
                }

                default: {
                    setResult({
                        status: 'warning',
                        message: `Unknown step type: ${effectiveType}`,
                    });
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setResult({
                status: 'error',
                message: message.includes('GraphQL')
                    ? 'API endpoint not available. Make sure the server is running.'
                    : message,
            });
        } finally {
            setLoading(false);
        }
    }, [effectiveType, config, sampleInput, limit]);

    // Render status badge
    const StatusBadge = ({ status }: { status: TestResult['status'] }) => {
        switch (status) {
            case 'success':
                return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Success</Badge>;
            case 'error':
                return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Error</Badge>;
            case 'warning':
                return <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" /> Warning</Badge>;
        }
    };

    // Render records as table
    const RecordsTable = ({ records }: { records: Array<Record<string, unknown>> }) => {
        if (!records.length) return <div className="text-muted-foreground text-sm">No records</div>;
        const allKeys = Array.from(new Set(records.flatMap(r => Object.keys(r)))).slice(0, 8);

        return (
            <div className="border rounded overflow-auto max-h-[300px]">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {allKeys.map(key => (
                                <TableHead key={key} className="text-xs whitespace-nowrap">{key}</TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {records.slice(0, 20).map((rec, idx) => (
                            <TableRow key={idx}>
                                {allKeys.map(key => (
                                    <TableCell key={key} className="text-xs py-1 max-w-[200px] truncate">
                                        {formatCellValue(rec[key])}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {records.length > 20 && (
                    <div className="text-xs text-muted-foreground p-2 border-t">
                        Showing 20 of {records.length} records
                    </div>
                )}
            </div>
        );
    };

    // Render before/after diff
    const BeforeAfterDiff = ({ beforeAfter }: { beforeAfter: Array<{ before: Record<string, unknown>; after: Record<string, unknown> }> }) => {
        return (
            <div className="space-y-3">
                {beforeAfter.slice(0, 5).map((pair, idx) => (
                    <div key={idx} className="border rounded overflow-hidden">
                        <div className="bg-muted/50 px-2 py-1 text-xs font-medium">Record {idx + 1}</div>
                        <div className="grid grid-cols-2 divide-x">
                            <div className="p-2">
                                <div className="text-xs text-muted-foreground mb-1">Before</div>
                                <pre className="text-[10px] bg-red-50 dark:bg-red-950/30 p-2 rounded overflow-auto max-h-[120px]">
                                    {JSON.stringify(pair.before, null, 2)}
                                </pre>
                            </div>
                            <div className="p-2">
                                <div className="text-xs text-muted-foreground mb-1">After</div>
                                <pre className="text-[10px] bg-green-50 dark:bg-green-950/30 p-2 rounded overflow-auto max-h-[120px]">
                                    {JSON.stringify(pair.after, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                ))}
                {beforeAfter.length > 5 && (
                    <div className="text-xs text-muted-foreground">
                        Showing 5 of {beforeAfter.length} records
                    </div>
                )}
            </div>
        );
    };

    // Render load simulation results
    const LoadSimulationResult = ({ simulation }: { simulation: Record<string, unknown> }) => {
        const entries = Object.entries(simulation);
        if (!entries.length) {
            return <div className="text-muted-foreground text-sm">No simulation data returned</div>;
        }

        return (
            <div className="space-y-2">
                {entries.map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between border rounded p-2">
                        <span className="text-sm font-medium">{formatKey(key)}</span>
                        <span className="text-sm font-mono">{formatValue(value)}</span>
                    </div>
                ))}
            </div>
        );
    };

    // Render feed preview
    const FeedPreview = ({ feedContent }: { feedContent: { content: string; contentType: string; itemCount: number } }) => {
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-4 text-sm">
                    <span><strong>Items:</strong> {feedContent.itemCount}</span>
                    <span><strong>Type:</strong> {feedContent.contentType}</span>
                </div>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[300px] whitespace-pre-wrap">
                    {feedContent.content || '(empty)'}
                </pre>
            </div>
        );
    };

    // Input section based on step type
    const renderInputSection = () => {
        switch (effectiveType) {
            case 'EXTRACT':
                return (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Label className="text-xs">Record limit</Label>
                            <Input
                                type="number"
                                value={limit}
                                onChange={e => setLimit(Math.max(1, parseInt(e.target.value) || 10))}
                                className="w-20 h-8"
                                min={1}
                                max={100}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Extracts data using the configured adapter and returns sample records.
                        </p>
                    </div>
                );

            case 'TRANSFORM':
            case 'VALIDATE':
            case 'LOAD':
                return (
                    <div className="space-y-2">
                        <Label className="text-xs">Sample Input Records (JSON Array)</Label>
                        <Textarea
                            value={sampleInput}
                            onChange={e => setSampleInput(e.target.value)}
                            className="font-mono text-xs min-h-[100px]"
                            placeholder="Enter JSON array of records..."
                        />
                        <p className="text-xs text-muted-foreground">
                            {effectiveType === 'TRANSFORM' && 'Applies configured transformations to these records.'}
                            {effectiveType === 'VALIDATE' && 'Runs validation rules on these records.'}
                            {effectiveType === 'LOAD' && 'Simulates loading these records (no actual database changes).'}
                        </p>
                    </div>
                );

            case 'FEED':
                return (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Label className="text-xs">Record limit</Label>
                            <Input
                                type="number"
                                value={limit}
                                onChange={e => setLimit(Math.max(1, parseInt(e.target.value) || 10))}
                                className="w-20 h-8"
                                min={1}
                                max={100}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Generates feed output using the configured feed adapter.
                        </p>
                    </div>
                );

            default:
                return (
                    <p className="text-xs text-muted-foreground">
                        This step type does not support direct testing.
                    </p>
                );
        }
    };

    // Render results section
    const renderResults = () => {
        if (!result) return null;

        return (
            <div className="space-y-3 pt-3 border-t">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <StatusBadge status={result.status} />
                        {result.message && (
                            <span className="text-sm text-muted-foreground">{result.message}</span>
                        )}
                    </div>
                    {(result.records || result.beforeAfter) && (
                        <Tabs value={resultView} onValueChange={v => setResultView(v as typeof resultView)}>
                            <TabsList className="h-7">
                                <TabsTrigger value="table" className="text-xs h-6 px-2">Table</TabsTrigger>
                                <TabsTrigger value="json" className="text-xs h-6 px-2">JSON</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    )}
                </div>

                {/* Records output */}
                {result.records && !result.beforeAfter && (
                    resultView === 'table'
                        ? <RecordsTable records={result.records} />
                        : <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[300px]">{JSON.stringify(result.records, null, 2)}</pre>
                )}

                {/* Before/After diff for transforms */}
                {result.beforeAfter && (
                    resultView === 'table'
                        ? <BeforeAfterDiff beforeAfter={result.beforeAfter} />
                        : <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[300px]">{JSON.stringify(result.beforeAfter, null, 2)}</pre>
                )}

                {/* Load simulation */}
                {result.loadSimulation && (
                    <LoadSimulationResult simulation={result.loadSimulation} />
                )}

                {/* Feed content */}
                {result.feedContent && (
                    <FeedPreview feedContent={result.feedContent} />
                )}

                {/* Generic data */}
                {result.data && !result.records && !result.feedContent && !result.loadSimulation && (
                    <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[200px]">
                        {JSON.stringify(result.data, null, 2)}
                    </pre>
                )}
            </div>
        );
    };

    // Check if testing is supported for this step type
    const canTest = ['EXTRACT', 'TRANSFORM', 'VALIDATE', 'LOAD', 'FEED'].includes(effectiveType);

    return (
        <Card className="mt-4">
            <CardHeader className="py-2 px-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-sm">Step Tester</CardTitle>
                        <Badge variant="outline" className="text-xs">{effectiveType}</Badge>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpanded(!expanded)}
                        className="h-7 px-2"
                    >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>
            </CardHeader>

            {expanded && (
                <CardContent className="pt-0 pb-3 px-3 space-y-3">
                    {canTest ? (
                        <>
                            {renderInputSection()}
                            <Button
                                onClick={runTest}
                                disabled={loading}
                                size="sm"
                                className="gap-2"
                            >
                                <PlayIcon className="h-3 w-3" />
                                {loading ? 'Running...' : 'Run Test'}
                            </Button>
                            {renderResults()}
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {effectiveType === 'TRIGGER'
                                ? 'Trigger steps define when pipelines run. Use the full pipeline dry run to test execution.'
                                : `${effectiveType} steps cannot be tested individually. Use the full pipeline dry run.`
                            }
                        </p>
                    )}
                </CardContent>
            )}
        </Card>
    );
}

// Utility functions
function formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function formatKey(key: string): string {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .replace(/_/g, ' ');
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}
