import * as React from 'react';
import {
    Button,
    DashboardRouteDefinition,
    Input,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PermissionGuard,
    Label,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@vendure/dashboard';
import { graphql } from '@/gql';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { toast } from 'sonner';
import { Save, Clock, Info, FileText, AlertCircle } from 'lucide-react';
import { DATAHUB_NAV_SECTION } from '../../constants/index';
import { FieldError, FormErrorSummary } from '../../components/common/validation-feedback';

// CONSTANTS

const LOG_PERSISTENCE_LEVELS = [
    { value: 'ERROR_ONLY', label: 'Errors Only', description: 'Only persist errors to database' },
    { value: 'PIPELINE', label: 'Pipeline Events', description: 'Pipeline start/complete/fail + errors (default)' },
    { value: 'STEP', label: 'Step Events', description: 'All pipeline events + step start/complete' },
    { value: 'DEBUG', label: 'Debug', description: 'All events including debug information' },
] as const;

// GRAPHQL

const settingsQuery = graphql(`
    query DataHubSettings {
        dataHubSettings {
            retentionDaysRuns
            retentionDaysErrors
            retentionDaysLogs
            logPersistenceLevel
        }
    }
`);

const setSettingsMutation = graphql(`
    mutation SetDataHubSettings($input: DataHubSettingsInput!) {
        setDataHubSettings(input: $input) {
            retentionDaysRuns
            retentionDaysErrors
            retentionDaysLogs
            logPersistenceLevel
        }
    }
`);

// ROUTE DEFINITION

export const settingsRoute: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-settings',
        url: '/data-hub/settings',
        title: 'Settings',
    },
    path: '/data-hub/settings',
    loader: () => ({ breadcrumb: 'Settings' }),
    component: () => (
        <PermissionGuard requires={['UpdateDataHubSettings']}>
            <SettingsPage />
        </PermissionGuard>
    ),
};

// MAIN PAGE

function SettingsPage() {
    const queryClient = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['DataHubSettings'],
        queryFn: () => api.query(settingsQuery, {}),
    });

    const settings = data?.dataHubSettings ?? {};

    // Form state
    const [runsDays, setRunsDays] = React.useState<string>('');
    const [errorsDays, setErrorsDays] = React.useState<string>('');
    const [logsDays, setLogsDays] = React.useState<string>('');
    const [logLevel, setLogLevel] = React.useState<string>('PIPELINE');
    const [isDirty, setIsDirty] = React.useState(false);

    // Validation state
    const [errors, setErrors] = React.useState<{
        runsDays?: string;
        errorsDays?: string;
        logsDays?: string;
    }>({});
    const [touched, setTouched] = React.useState<{
        runsDays?: boolean;
        errorsDays?: boolean;
        logsDays?: boolean;
    }>({});

    // Validation function
    const validateRetentionDays = (value: string, fieldName: string): string | undefined => {
        if (value === '') return undefined; // Empty is valid (uses default)
        const num = Number(value);
        if (isNaN(num)) return 'Please enter a valid number';
        if (!Number.isInteger(num)) return 'Please enter a whole number';
        if (num < 1) return 'Must be at least 1 day';
        if (num > 365) return 'Must be no more than 365 days';
        return undefined;
    };

    const isFormValid = React.useMemo(() => {
        return !errors.runsDays && !errors.errorsDays && !errors.logsDays;
    }, [errors]);

    // Sync with server data
    React.useEffect(() => {
        if (settings.retentionDaysRuns != null) {
            setRunsDays(String(settings.retentionDaysRuns));
        }
        if (settings.retentionDaysErrors != null) {
            setErrorsDays(String(settings.retentionDaysErrors));
        }
        if (settings.retentionDaysLogs != null) {
            setLogsDays(String(settings.retentionDaysLogs));
        }
        if (settings.logPersistenceLevel) {
            setLogLevel(settings.logPersistenceLevel);
        }
        setIsDirty(false);
        setErrors({});
        setTouched({});
    }, [settings.retentionDaysRuns, settings.retentionDaysErrors, settings.retentionDaysLogs, settings.logPersistenceLevel]);

    const mutation = useMutation({
        mutationFn: (vars: { runs?: number | null; errors?: number | null; logs?: number | null; logLevel?: string }) =>
            api.mutate(setSettingsMutation, {
                input: {
                    retentionDaysRuns: vars.runs ?? null,
                    retentionDaysErrors: vars.errors ?? null,
                    retentionDaysLogs: vars.logs ?? null,
                    logPersistenceLevel: vars.logLevel ?? null,
                },
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['DataHubSettings'] });
            toast('Settings saved successfully');
            setIsDirty(false);
        },
        onError: (err: any) => {
            toast('Failed to save settings', {
                description: err?.message ?? 'Unknown error',
            });
        },
    });

    const handleSave = () => {
        // Validate all fields before save
        const newErrors = {
            runsDays: validateRetentionDays(runsDays, 'Pipeline Run History'),
            errorsDays: validateRetentionDays(errorsDays, 'Error Records'),
            logsDays: validateRetentionDays(logsDays, 'Log Retention'),
        };
        setErrors(newErrors);
        setTouched({ runsDays: true, errorsDays: true, logsDays: true });

        // Don't save if there are errors
        if (newErrors.runsDays || newErrors.errorsDays || newErrors.logsDays) {
            toast('Please fix validation errors before saving');
            return;
        }

        mutation.mutate({
            runs: runsDays === '' ? null : Number(runsDays),
            errors: errorsDays === '' ? null : Number(errorsDays),
            logs: logsDays === '' ? null : Number(logsDays),
            logLevel,
        });
    };

    const handleRunsDaysChange = (value: string) => {
        setRunsDays(value);
        setIsDirty(true);
        const error = validateRetentionDays(value, 'Pipeline Run History');
        setErrors(prev => ({ ...prev, runsDays: error }));
    };

    const handleErrorsDaysChange = (value: string) => {
        setErrorsDays(value);
        setIsDirty(true);
        const error = validateRetentionDays(value, 'Error Records');
        setErrors(prev => ({ ...prev, errorsDays: error }));
    };

    const handleLogsDaysChange = (value: string) => {
        setLogsDays(value);
        setIsDirty(true);
        const error = validateRetentionDays(value, 'Log Retention');
        setErrors(prev => ({ ...prev, logsDays: error }));
    };

    const handleLogLevelChange = (value: string) => {
        setLogLevel(value);
        setIsDirty(true);
    };

    const handleBlur = (field: 'runsDays' | 'errorsDays' | 'logsDays') => {
        setTouched(prev => ({ ...prev, [field]: true }));
    };

    return (
        <Page pageId="data-hub-settings">
            <PageActionBar>
                <PageActionBarRight>
                    <Button onClick={handleSave} disabled={mutation.isPending || !isDirty || !isFormValid}>
                        <Save className="w-4 h-4 mr-2" />
                        Save Settings
                    </Button>
                </PageActionBarRight>
            </PageActionBar>

            <PageBlock column="main" blockId="retention">
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <Clock className="w-5 h-5 text-primary" />
                            <div>
                                <CardTitle>Data Retention</CardTitle>
                                <CardDescription>
                                    Configure how long data is kept before automatic cleanup
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="py-4 text-muted-foreground">Loading...</div>
                        ) : (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="runs-days">Pipeline Run History</Label>
                                        <Input
                                            id="runs-days"
                                            type="number"
                                            min="1"
                                            max="365"
                                            placeholder="7"
                                            value={runsDays}
                                            onChange={e => handleRunsDaysChange(e.target.value)}
                                            onBlur={() => handleBlur('runsDays')}
                                            className={errors.runsDays && touched.runsDays ? 'border-destructive focus-visible:ring-destructive' : ''}
                                        />
                                        <FieldError error={errors.runsDays} touched={touched.runsDays} />
                                        {!errors.runsDays && (
                                            <p className="text-xs text-muted-foreground">
                                                Days to keep completed pipeline runs. Leave empty for default (7 days).
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="errors-days">Error Records</Label>
                                        <Input
                                            id="errors-days"
                                            type="number"
                                            min="1"
                                            max="365"
                                            placeholder="30"
                                            value={errorsDays}
                                            onChange={e => handleErrorsDaysChange(e.target.value)}
                                            onBlur={() => handleBlur('errorsDays')}
                                            className={errors.errorsDays && touched.errorsDays ? 'border-destructive focus-visible:ring-destructive' : ''}
                                        />
                                        <FieldError error={errors.errorsDays} touched={touched.errorsDays} />
                                        {!errors.errorsDays && (
                                            <p className="text-xs text-muted-foreground">
                                                Days to keep failed record entries. Leave empty for default (30 days).
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="p-3 bg-muted rounded-lg flex items-start gap-2">
                                    <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
                                    <div className="text-sm text-muted-foreground">
                                        <p>
                                            Retention cleanup runs automatically. Older data is permanently deleted
                                            to free up database space.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </PageBlock>

            <PageBlock column="main" blockId="logging">
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-primary" />
                            <div>
                                <CardTitle>Logging</CardTitle>
                                <CardDescription>
                                    Configure what gets logged to the database for the dashboard
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="py-4 text-muted-foreground">Loading...</div>
                        ) : (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="log-level">Log Persistence Level</Label>
                                        <Select value={logLevel} onValueChange={handleLogLevelChange}>
                                            <SelectTrigger id="log-level">
                                                <SelectValue placeholder="Select level..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {LOG_PERSISTENCE_LEVELS.map(level => (
                                                    <SelectItem key={level.value} value={level.value}>
                                                        <div className="flex flex-col">
                                                            <span>{level.label}</span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            {LOG_PERSISTENCE_LEVELS.find(l => l.value === logLevel)?.description}
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="logs-days">Log Retention</Label>
                                        <Input
                                            id="logs-days"
                                            type="number"
                                            min="1"
                                            max="365"
                                            placeholder="30"
                                            value={logsDays}
                                            onChange={e => handleLogsDaysChange(e.target.value)}
                                            onBlur={() => handleBlur('logsDays')}
                                            className={errors.logsDays && touched.logsDays ? 'border-destructive focus-visible:ring-destructive' : ''}
                                        />
                                        <FieldError error={errors.logsDays} touched={touched.logsDays} />
                                        {!errors.logsDays && (
                                            <p className="text-xs text-muted-foreground">
                                                Days to keep log entries. Leave empty for default (30 days).
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="p-3 bg-muted rounded-lg flex items-start gap-2">
                                    <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
                                    <div className="text-sm text-muted-foreground">
                                        <p>
                                            <strong>Console logging is always full</strong> - this setting only controls what gets saved to the database
                                            and shown in the Log Explorer. Higher levels provide more visibility but use more database space.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </PageBlock>
        </Page>
    );
}
