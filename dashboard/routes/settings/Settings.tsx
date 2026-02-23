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
import { toast } from 'sonner';
import { Save, Clock, Info, FileText } from 'lucide-react';
import { DATAHUB_NAV_SECTION, ROUTES, DATAHUB_PERMISSIONS, RETENTION, TOAST_SETTINGS, ERROR_MESSAGES, RETENTION_DEFAULTS } from '../../constants';
import { FieldError } from '../../components/common';
import { LoadingState, ErrorState } from '../../components/shared';
import { getErrorMessage } from '../../../shared';
import { useSettings, useUpdateSettings, useOptionValues } from '../../hooks';

export const settingsPage: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-settings',
        url: ROUTES.SETTINGS,
        title: 'Settings',
    },
    path: ROUTES.SETTINGS,
    loader: () => ({ breadcrumb: 'Settings' }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.UPDATE_SETTINGS]}>
            <SettingsPage />
        </PermissionGuard>
    ),
};

function SettingsPage() {
    const { data: settings, isLoading, isError, error, refetch } = useSettings();
    const updateSettings = useUpdateSettings();
    const { options: logPersistenceOptions, isLoading: isLoadingOptions } = useOptionValues('logPersistenceLevels');

    const [runsDays, setRunsDays] = React.useState<string>('');
    const [errorsDays, setErrorsDays] = React.useState<string>('');
    const [logsDays, setLogsDays] = React.useState<string>('');
    const [logLevel, setLogLevel] = React.useState<string>('PIPELINE');
    const [isDirty, setIsDirty] = React.useState(false);

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

    const validateRetentionDays = (value: string): string | undefined => {
        if (value === '') return undefined;
        const num = Number(value);
        if (isNaN(num)) return ERROR_MESSAGES.INVALID_NUMBER;
        if (!Number.isInteger(num)) return ERROR_MESSAGES.INVALID_INTEGER;
        if (num < RETENTION.MIN_DAYS) return ERROR_MESSAGES.TOO_SMALL(RETENTION.MIN_DAYS);
        if (num > RETENTION.MAX_DAYS) return ERROR_MESSAGES.TOO_LARGE(RETENTION.MAX_DAYS);
        return undefined;
    };

    const isFormValid = React.useMemo(() => {
        return !errors.runsDays && !errors.errorsDays && !errors.logsDays;
    }, [errors]);

    React.useEffect(() => {
        if (settings?.retentionDaysRuns != null) {
            setRunsDays(String(settings.retentionDaysRuns));
        }
        if (settings?.retentionDaysErrors != null) {
            setErrorsDays(String(settings.retentionDaysErrors));
        }
        if (settings?.retentionDaysLogs != null) {
            setLogsDays(String(settings.retentionDaysLogs));
        }
        if (settings?.logPersistenceLevel) {
            setLogLevel(settings.logPersistenceLevel);
        }
        setIsDirty(false);
        setErrors({});
        setTouched({});
    }, [settings?.retentionDaysRuns, settings?.retentionDaysErrors, settings?.retentionDaysLogs, settings?.logPersistenceLevel]);

    const handleSave = () => {
        const newErrors = {
            runsDays: validateRetentionDays(runsDays),
            errorsDays: validateRetentionDays(errorsDays),
            logsDays: validateRetentionDays(logsDays),
        };
        setErrors(newErrors);
        setTouched({ runsDays: true, errorsDays: true, logsDays: true });

        if (newErrors.runsDays || newErrors.errorsDays || newErrors.logsDays) {
            toast.error(TOAST_SETTINGS.VALIDATION_ERRORS);
            return;
        }

        updateSettings.mutate(
            {
                retentionDaysRuns: runsDays === '' ? null : Number(runsDays),
                retentionDaysErrors: errorsDays === '' ? null : Number(errorsDays),
                retentionDaysLogs: logsDays === '' ? null : Number(logsDays),
                logPersistenceLevel: logLevel,
            },
            {
                onSuccess: () => {
                    setIsDirty(false);
                },
            }
        );
    };

    const handleRunsDaysChange = (value: string) => {
        setRunsDays(value);
        setIsDirty(true);
        const error = validateRetentionDays(value);
        setErrors(prev => ({ ...prev, runsDays: error }));
    };

    const handleErrorsDaysChange = (value: string) => {
        setErrorsDays(value);
        setIsDirty(true);
        const error = validateRetentionDays(value);
        setErrors(prev => ({ ...prev, errorsDays: error }));
    };

    const handleLogsDaysChange = (value: string) => {
        setLogsDays(value);
        setIsDirty(true);
        const error = validateRetentionDays(value);
        setErrors(prev => ({ ...prev, logsDays: error }));
    };

    const handleLogLevelChange = (value: string) => {
        setLogLevel(value);
        setIsDirty(true);
    };

    const handleBlur = (field: 'runsDays' | 'errorsDays' | 'logsDays') => {
        setTouched(prev => ({ ...prev, [field]: true }));
    };

    if (isError) {
        return (
            <Page pageId="data-hub-settings">
                <PageBlock column="main" blockId="error">
                    <ErrorState
                        title="Failed to load settings"
                        message={getErrorMessage(error)}
                        onRetry={() => refetch()}
                    />
                </PageBlock>
            </Page>
        );
    }

    if (isLoading) {
        return (
            <Page pageId="data-hub-settings">
                <PageBlock column="main" blockId="loading">
                    <LoadingState type="form" rows={4} message="Loading settings..." />
                </PageBlock>
            </Page>
        );
    }

    return (
        <Page pageId="data-hub-settings">
            <PageActionBar>
                <PageActionBarRight>
                    <Button onClick={handleSave} disabled={updateSettings.isPending || !isDirty || !isFormValid} data-testid="settings-save-button">
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
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="runs-days">Pipeline Run History</Label>
                                    <Input
                                        id="runs-days"
                                        type="number"
                                        min="1"
                                        max={String(RETENTION.MAX_DAYS)}
                                        placeholder={String(RETENTION_DEFAULTS.RUNS_DAYS)}
                                        value={runsDays}
                                        onChange={e => handleRunsDaysChange(e.target.value)}
                                        onBlur={() => handleBlur('runsDays')}
                                        className={errors.runsDays && touched.runsDays ? 'border-destructive focus-visible:ring-destructive' : ''}
                                        data-testid="settings-runs-retention-input"
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
                                        max={String(RETENTION.MAX_DAYS)}
                                        placeholder={String(RETENTION_DEFAULTS.ERROR_DAYS)}
                                        value={errorsDays}
                                        onChange={e => handleErrorsDaysChange(e.target.value)}
                                        onBlur={() => handleBlur('errorsDays')}
                                        className={errors.errorsDays && touched.errorsDays ? 'border-destructive focus-visible:ring-destructive' : ''}
                                        data-testid="settings-errors-retention-input"
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
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="log-level">Log Persistence Level</Label>
                                    <Select value={logLevel} onValueChange={handleLogLevelChange} disabled={isLoadingOptions}>
                                        <SelectTrigger id="log-level" data-testid="settings-log-level-select">
                                            <SelectValue placeholder={isLoadingOptions ? 'Loading...' : 'Select level...'} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {logPersistenceOptions.map(level => (
                                                <SelectItem key={level.value} value={level.value}>
                                                    <div className="flex flex-col">
                                                        <span>{level.label}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        {logPersistenceOptions.find(l => l.value === logLevel)?.description}
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="logs-days">Log Retention</Label>
                                    <Input
                                        id="logs-days"
                                        type="number"
                                        min="1"
                                        max={String(RETENTION.MAX_DAYS)}
                                        placeholder={String(RETENTION_DEFAULTS.LOGS_DAYS)}
                                        value={logsDays}
                                        onChange={e => handleLogsDaysChange(e.target.value)}
                                        onBlur={() => handleBlur('logsDays')}
                                        className={errors.logsDays && touched.logsDays ? 'border-destructive focus-visible:ring-destructive' : ''}
                                        data-testid="settings-logs-retention-input"
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
                    </CardContent>
                </Card>
            </PageBlock>
        </Page>
    );
}
