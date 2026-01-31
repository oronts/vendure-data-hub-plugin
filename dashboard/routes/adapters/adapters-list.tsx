import * as React from 'react';
import {
    Button,
    DataTable,
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
    PageBlock,
    Textarea,
    PermissionGuard,
    Page,
    PageActionBar,
    PageActionBarRight,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Badge,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@vendure/dashboard';
import { DATAHUB_NAV_SECTION, UI_DEFAULTS, ROUTES, BUILT_IN_ADAPTER_PREFIXES, DATAHUB_PERMISSIONS, ADAPTER_TYPES, TEXTAREA_HEIGHTS, TOAST_ADAPTER } from '../../constants';
import { StatCard } from '../../components/shared';
import { DashboardRouteDefinition } from '@vendure/dashboard';
import { ColumnDef } from '@tanstack/react-table';
import {
    Database,
    Cog,
    Upload,
    RefreshCw,
    Copy,
    CheckCircle2,
    Info,
    Code2,
    Puzzle,
    Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ErrorState, LoadingState } from '../../components/shared';
import { useAdapters } from '../../hooks';
import type { DataHubAdapter } from '../../types';

export const adaptersList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-adapters',
        url: ROUTES.ADAPTERS,
        title: 'Adapters',
    },
    path: ROUTES.ADAPTERS,
    loader: () => ({ breadcrumb: 'Adapters' }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.MANAGE_ADAPTERS]}>
            <AdaptersPage />
        </PermissionGuard>
    ),
};

const ADAPTER_TYPE_INFO = {
    extractor: {
        label: 'Extractors',
        description: 'Pull data from external sources (APIs, databases, files)',
        icon: <Database className="w-5 h-5" />,
        color: 'bg-blue-100 text-blue-800',
    },
    operator: {
        label: 'Operators',
        description: 'Transform, filter, and enrich data during processing',
        icon: <Cog className="w-5 h-5" />,
        color: 'bg-purple-100 text-purple-800',
    },
    loader: {
        label: 'Loaders',
        description: 'Write data to destinations (Vendure, files, external APIs)',
        icon: <Upload className="w-5 h-5" />,
        color: 'bg-green-100 text-green-800',
    },
};

function AdaptersPage() {
    const { data: rows = [], isLoading, isError, error, refetch } = useAdapters();
    const [selected, setSelected] = React.useState<DataHubAdapter | null>(null);

    const extractors = rows.filter(r => r.type === ADAPTER_TYPES.EXTRACTOR);
    const operators = rows.filter(r => r.type === ADAPTER_TYPES.OPERATOR);
    const loaders = rows.filter(r => r.type === ADAPTER_TYPES.LOADER);

    const isBuiltIn = (code: string) => {
        return BUILT_IN_ADAPTER_PREFIXES.some(p => code.startsWith(p));
    };

    if (isError) {
        return (
            <Page pageId="data-hub-adapters">
                <PageBlock column="main" blockId="error">
                    <ErrorState
                        title="Failed to load adapters"
                        message={error instanceof Error ? error.message : 'An unknown error occurred'}
                        onRetry={() => refetch()}
                    />
                </PageBlock>
            </Page>
        );
    }

    if (isLoading && rows.length === 0) {
        return (
            <Page pageId="data-hub-adapters">
                <PageBlock column="main" blockId="loading">
                    <LoadingState type="card" rows={3} message="Loading adapters..." />
                </PageBlock>
            </Page>
        );
    }

    return (
        <Page pageId="data-hub-adapters">
            <PageActionBar>
                <PageActionBarRight>
                    <Button variant="ghost" onClick={() => refetch()} disabled={isLoading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </PageActionBarRight>
            </PageActionBar>

            <PageBlock column="main" blockId="intro">
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Puzzle className="w-5 h-5 text-primary" />
                            <CardTitle>Pipeline Adapters</CardTitle>
                        </div>
                        <CardDescription>
                            Adapters are the building blocks of your data pipelines. They handle extracting
                            data from sources, transforming it, and loading it into destinations.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4">
                            <StatCard
                                icon={ADAPTER_TYPE_INFO.extractor.icon}
                                title="Extractors"
                                value={extractors.length}
                                variant="info"
                            />
                            <StatCard
                                icon={ADAPTER_TYPE_INFO.operator.icon}
                                title="Operators"
                                value={operators.length}
                            />
                            <StatCard
                                icon={ADAPTER_TYPE_INFO.loader.icon}
                                title="Loaders"
                                value={loaders.length}
                                variant="success"
                            />
                        </div>
                    </CardContent>
                </Card>
            </PageBlock>

            <PageBlock column="main" blockId="adapters">
                <Tabs defaultValue="extractors" className="w-full">
                    <TabsList className="mb-4">
                        <TabsTrigger value="extractors" className="gap-2">
                            <Database className="w-4 h-4" />
                            Extractors ({extractors.length})
                        </TabsTrigger>
                        <TabsTrigger value="operators" className="gap-2">
                            <Cog className="w-4 h-4" />
                            Operators ({operators.length})
                        </TabsTrigger>
                        <TabsTrigger value="loaders" className="gap-2">
                            <Upload className="w-4 h-4" />
                            Loaders ({loaders.length})
                        </TabsTrigger>
                        <TabsTrigger value="all" className="gap-2">
                            <Settings2 className="w-4 h-4" />
                            All ({rows.length})
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="extractors">
                        <AdapterTypeSection
                            type="extractor"
                            adapters={extractors}
                            onSelect={setSelected}
                            isBuiltIn={isBuiltIn}
                        />
                    </TabsContent>

                    <TabsContent value="operators">
                        <AdapterTypeSection
                            type="operator"
                            adapters={operators}
                            onSelect={setSelected}
                            isBuiltIn={isBuiltIn}
                        />
                    </TabsContent>

                    <TabsContent value="loaders">
                        <AdapterTypeSection
                            type="loader"
                            adapters={loaders}
                            onSelect={setSelected}
                            isBuiltIn={isBuiltIn}
                        />
                    </TabsContent>

                    <TabsContent value="all">
                        <AdaptersTable
                            adapters={rows}
                            onSelect={setSelected}
                            isBuiltIn={isBuiltIn}
                            isLoading={isLoading}
                        />
                    </TabsContent>
                </Tabs>
            </PageBlock>

            <Drawer open={!!selected} onOpenChange={open => !open && setSelected(null)}>
                <DrawerContent>
                    <DrawerHeader>
                        <div className="flex items-center gap-2">
                            <Badge className={ADAPTER_TYPE_INFO[selected?.type || 'extractor']?.color ?? ''}>
                                {selected?.type}
                            </Badge>
                            <DrawerTitle>{selected?.code}</DrawerTitle>
                        </div>
                        <DrawerDescription>
                            {selected?.description || 'No description available'}
                        </DrawerDescription>
                    </DrawerHeader>
                    {selected && <AdapterDetail adapter={selected} />}
                </DrawerContent>
            </Drawer>
        </Page>
    );
}


function AdapterTypeSection({
    type,
    adapters,
    onSelect,
    isBuiltIn,
}: Readonly<{
    type: 'extractor' | 'operator' | 'loader';
    adapters: DataHubAdapter[];
    onSelect: (adapter: DataHubAdapter) => void;
    isBuiltIn: (code: string) => boolean;
}>) {
    const info = ADAPTER_TYPE_INFO[type];
    const builtIn = adapters.filter(a => isBuiltIn(a.code));
    const custom = adapters.filter(a => !isBuiltIn(a.code));

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border">
                <div className={`p-2 rounded-lg ${info.color}`}>{info.icon}</div>
                <div>
                    <h3 className="font-semibold">{info.label}</h3>
                    <p className="text-sm text-muted-foreground">{info.description}</p>
                </div>
            </div>

            {builtIn.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        Built-in Adapters ({builtIn.length})
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                        {builtIn.map(adapter => (
                            <AdapterCard
                                key={adapter.code}
                                adapter={adapter}
                                onSelect={onSelect}
                                isBuiltIn
                            />
                        ))}
                    </div>
                </div>
            )}

            {custom.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <Puzzle className="w-4 h-4 text-purple-600" />
                        Custom Adapters ({custom.length})
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                        {custom.map(adapter => (
                            <AdapterCard
                                key={adapter.code}
                                adapter={adapter}
                                onSelect={onSelect}
                            />
                        ))}
                    </div>
                </div>
            )}

            {adapters.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                    <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No {type}s registered yet.</p>
                    <p className="text-sm">Register adapters in your plugin configuration.</p>
                </div>
            )}
        </div>
    );
}

const AdapterCard = React.memo(function AdapterCard({
    adapter,
    onSelect,
    isBuiltIn = false,
}: Readonly<{
    adapter: DataHubAdapter;
    onSelect: (adapter: DataHubAdapter) => void;
    isBuiltIn?: boolean;
}>) {
    const handleClick = React.useCallback(() => {
        onSelect(adapter);
    }, [onSelect, adapter]);

    return (
        <div
            className="border rounded-lg p-3 cursor-pointer hover:border-primary hover:shadow-sm transition-all"
            onClick={handleClick}
        >
            <div className="flex items-start justify-between mb-2">
                <code className="text-sm font-medium">{adapter.code}</code>
                <div className="flex items-center gap-1">
                    {isBuiltIn && (
                        <Badge variant="outline" className="text-xs">
                            Built-in
                        </Badge>
                    )}
                    {adapter.pure && (
                        <Badge variant="secondary" className="text-xs">
                            Pure
                        </Badge>
                    )}
                </div>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                {adapter.description || 'No description'}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{adapter.schema.fields.length} fields</span>
                {adapter.requires && adapter.requires.length > 0 && (
                    <>
                        <span>•</span>
                        <span>Requires: {adapter.requires.join(', ')}</span>
                    </>
                )}
            </div>
        </div>
    );
});

function AdaptersTable({
    adapters,
    onSelect,
    isBuiltIn,
    isLoading,
}: Readonly<{
    adapters: DataHubAdapter[];
    onSelect: (adapter: DataHubAdapter) => void;
    isBuiltIn: (code: string) => boolean;
    isLoading: boolean;
}>) {
    const columns: ColumnDef<DataHubAdapter, unknown>[] = React.useMemo(() => [
        {
            id: 'type',
            header: 'Type',
            accessorFn: row => row.type,
            cell: ({ row }) => {
                const typeInfo = ADAPTER_TYPE_INFO[row.original.type as keyof typeof ADAPTER_TYPE_INFO];
                return (
                    <Badge className={typeInfo?.color ?? ''}>
                        {row.original.type}
                    </Badge>
                );
            },
        },
        {
            id: 'code',
            header: 'Code',
            accessorFn: row => row.code,
            cell: ({ row }) => (
                <button
                    className="font-mono text-sm underline-offset-2 hover:underline"
                    onClick={() => onSelect(row.original)}
                >
                    {row.original.code}
                </button>
            ),
        },
        {
            id: 'description',
            header: 'Description',
            accessorFn: row => row.description ?? '',
            cell: ({ row }) => (
                <span className="text-muted-foreground text-sm line-clamp-1">
                    {row.original.description || '—'}
                </span>
            ),
        },
        {
            id: 'fields',
            header: 'Fields',
            accessorFn: row => row.schema.fields.length,
        },
        {
            id: 'source',
            header: 'Source',
            accessorFn: row => (isBuiltIn(row.code) ? 'Built-in' : 'Custom'),
            cell: ({ row }) => (
                <Badge variant={isBuiltIn(row.original.code) ? 'outline' : 'secondary'}>
                    {isBuiltIn(row.original.code) ? 'Built-in' : 'Custom'}
                </Badge>
            ),
        },
    ], [onSelect, isBuiltIn]);

    return (
        <DataTable
            columns={columns}
            data={adapters}
            isLoading={isLoading}
            totalItems={adapters.length}
            itemsPerPage={adapters.length || 10}
            page={1}
            disableViewOptions
        />
    );
}

function AdapterDetail({ adapter }: Readonly<{ adapter: DataHubAdapter }>) {
    const [copied, setCopied] = React.useState(false);
    const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cleanup timeout on unmount
    React.useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) {
                clearTimeout(copyTimeoutRef.current);
            }
        };
    }, []);

    const exampleConfig = React.useMemo(() => {
        const config: Record<string, unknown> = { adapterCode: adapter.code };
        for (const field of adapter.schema.fields) {
            if (field.required) {
                config[field.key] = guessExampleValue(field.type, field.options);
            }
        }
        return JSON.stringify(config, null, 2);
    }, [adapter]);

    const copyConfig = async () => {
        try {
            await navigator.clipboard.writeText(exampleConfig);
            setCopied(true);
            toast.success(TOAST_ADAPTER.CONFIG_COPIED);
            // Clear any existing timeout before setting a new one
            if (copyTimeoutRef.current) {
                clearTimeout(copyTimeoutRef.current);
            }
            copyTimeoutRef.current = setTimeout(() => setCopied(false), UI_DEFAULTS.COPY_FEEDBACK_TIMEOUT_MS);
        } catch {
            toast.error(TOAST_ADAPTER.COPY_ERROR);
        }
    };

    return (
        <div className="p-4 space-y-6">
            <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground mb-1">Type</div>
                    <Badge className={ADAPTER_TYPE_INFO[adapter.type].color}>
                        {adapter.type}
                    </Badge>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground mb-1">Pure Function</div>
                    <div className="font-medium">{adapter.pure ? 'Yes' : 'No'}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground mb-1">Dependencies</div>
                    <div className="font-medium">
                        {adapter.requires?.length ? adapter.requires.join(', ') : 'None'}
                    </div>
                </div>
            </div>

            <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Settings2 className="w-4 h-4" />
                    Configuration Fields
                </h4>
                <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-muted">
                                <th className="text-left px-3 py-2">Field</th>
                                <th className="text-left px-3 py-2">Type</th>
                                <th className="text-left px-3 py-2">Required</th>
                                <th className="text-left px-3 py-2">Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {adapter.schema.fields.map(field => (
                                <tr key={field.key} className="border-t">
                                    <td className="px-3 py-2">
                                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                            {field.key}
                                        </code>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground">
                                        {field.type}
                                        {field.options && field.options.length > 0 && (
                                            <span className="ml-1 text-xs">
                                                ({field.options.map(o => o.value).join(' | ')})
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        {field.required ? (
                                            <Badge variant="destructive" className="text-xs">
                                                Required
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-xs">
                                                Optional
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground">
                                        {field.description || field.label || '—'}
                                    </td>
                                </tr>
                            ))}
                            {adapter.schema.fields.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                                        No configuration fields
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                        <Code2 className="w-4 h-4" />
                        Example Configuration
                    </h4>
                    <Button variant="outline" size="sm" onClick={copyConfig}>
                        {copied ? (
                            <CheckCircle2 className="w-4 h-4 mr-1 text-green-600" />
                        ) : (
                            <Copy className="w-4 h-4 mr-1" />
                        )}
                        {copied ? 'Copied!' : 'Copy'}
                    </Button>
                </div>
                <Textarea
                    value={exampleConfig}
                    readOnly
                    className={`font-mono text-sm ${TEXTAREA_HEIGHTS.ADAPTER_SCHEMA}`}
                />
            </div>
        </div>
    );
}

function guessExampleValue(
    type: string,
    options?: Array<{ value: string; label: string }> | null,
): unknown {
    if (options && options.length > 0) {
        return options[0].value;
    }
    switch (type) {
        case 'number':
            return 1000;
        case 'boolean':
            return true;
        case 'select':
            return 'value';
        case 'json':
            return {};
        case 'array':
            return [];
        default:
            return 'value';
    }
}
