import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    DashboardRouteDefinition,
    Input,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    PermissionGuard,
    usePermissions,
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
import { DATAHUB_NAV_LABELS, DATAHUB_NAV_SECTION, ROUTES, DATAHUB_PERMISSIONS, RETENTION } from '../../constants';
import { FieldError } from '../../components/common';
import { LoadingState, ErrorState } from '../../components/shared';
import { getErrorMessage } from '../../../shared';
import { retentionDaysInputValue } from './retention-input';
import { useSettings, useUpdateSettings, useOptionValues } from '../../hooks';
import { LogPersistenceLevel } from '../../types';

const LOG_PERSISTENCE_LEVELS: ReadonlySet<string> = new Set(Object.values(LogPersistenceLevel));

function isLogPersistenceLevel(value: string): value is LogPersistenceLevel {
    return LOG_PERSISTENCE_LEVELS.has(value);
}

export const settingsPage: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-settings',
        url: ROUTES.SETTINGS,
        title: DATAHUB_NAV_LABELS.SETTINGS,
        requiresPermission: DATAHUB_PERMISSIONS.READ_PIPELINE,
    },
    path: ROUTES.SETTINGS,
    loader: () => ({ breadcrumb: DATAHUB_NAV_LABELS.SETTINGS }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.READ_PIPELINE]}>
            <SettingsPage />
        </PermissionGuard>
    ),
};

export function SettingsPage() {
    const { t } = useLingui();
    const { hasPermissions } = usePermissions();
    const canUpdate = hasPermissions([DATAHUB_PERMISSIONS.UPDATE_SETTINGS]);
    const { data: settings, isLoading, isError, error, refetch } = useSettings();
    const hasSettings = settings != null;
    const retentionDaysRuns = settings?.retentionDaysRuns;
    const retentionDaysErrors = settings?.retentionDaysErrors;
    const retentionDaysLogs = settings?.retentionDaysLogs;
    const settingsLogLevel = settings?.logPersistenceLevel;
    const updateSettings = useUpdateSettings({
        successMessage: t`Settings saved successfully`,
        errorMessage: t`Failed to save settings`,
    });
    const { options: logPersistenceOptions, isLoading: isLoadingOptions } = useOptionValues('logPersistenceLevels');

    const [runsDays, setRunsDays] = React.useState<string>('');
    const [errorsDays, setErrorsDays] = React.useState<string>('');
    const [logsDays, setLogsDays] = React.useState<string>('');
    const [logLevel, setLogLevel] = React.useState<LogPersistenceLevel>(LogPersistenceLevel.PIPELINE);
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
        if (isNaN(num)) return t`Enter a valid number`;
        if (!Number.isInteger(num)) return t`Enter a whole number`;
        if (num < RETENTION.MIN_DAYS) {
            return t`Value must be at least ${RETENTION.MIN_DAYS}`;
        }
        if (num > RETENTION.MAX_DAYS) {
            return t`Value must not exceed ${RETENTION.MAX_DAYS}`;
        }
        return undefined;
    };

    const isFormValid = !errors.runsDays && !errors.errorsDays && !errors.logsDays;

    React.useEffect(() => {
        if (!hasSettings) return;
        setRunsDays(retentionDaysInputValue(retentionDaysRuns));
        setErrorsDays(retentionDaysInputValue(retentionDaysErrors));
        setLogsDays(retentionDaysInputValue(retentionDaysLogs));
        setLogLevel(settingsLogLevel ?? LogPersistenceLevel.PIPELINE);
        setIsDirty(false);
        setErrors({});
        setTouched({});
    }, [
        hasSettings,
        retentionDaysErrors,
        retentionDaysLogs,
        retentionDaysRuns,
        settingsLogLevel,
    ]);

    const handleSave = () => {
        const newErrors = {
            runsDays: validateRetentionDays(runsDays),
            errorsDays: validateRetentionDays(errorsDays),
            logsDays: validateRetentionDays(logsDays),
        };
        setErrors(newErrors);
        setTouched({ runsDays: true, errorsDays: true, logsDays: true });

        if (newErrors.runsDays || newErrors.errorsDays || newErrors.logsDays) {
            toast.error(t`Fix the validation errors before saving`);
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
        if (!isLogPersistenceLevel(value)) return;
        setLogLevel(value);
        setIsDirty(true);
    };

    const handleBlur = (field: 'runsDays' | 'errorsDays' | 'logsDays') => {
        setTouched(prev => ({ ...prev, [field]: true }));
    };

    if (isError) {
        return (
            <Page pageId="data-hub-settings">
                <PageTitle><Trans>Settings</Trans></PageTitle>
                <PageLayout>
                    <PageBlock column="main" blockId="error">
                        <ErrorState
                            title={t`Failed to load settings`}
                            message={getErrorMessage(error)}
                            onRetry={() => refetch()}
                        />
                    </PageBlock>
                </PageLayout>
            </Page>
        );
    }

    if (isLoading) {
        return (
            <Page pageId="data-hub-settings">
                <PageTitle><Trans>Settings</Trans></PageTitle>
                <PageLayout>
                    <PageBlock column="main" blockId="loading">
                        <LoadingState
                            type="form"
                            rows={4}
                            message={t`Loading settings...`}
                        />
                    </PageBlock>
                </PageLayout>
            </Page>
        );
    }

    return (
        <Page pageId="data-hub-settings">
            <PageTitle><Trans>Settings</Trans></PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <PermissionGuard requires={[DATAHUB_PERMISSIONS.UPDATE_SETTINGS]}>
                        <Button onClick={handleSave} disabled={updateSettings.isPending || !isDirty || !isFormValid} data-testid="settings-save-button">
                            <Save className="w-4 h-4 mr-2" />
                            <Trans>Save Settings</Trans>
                        </Button>
                    </PermissionGuard>
                </PageActionBarRight>
            </PageActionBar>

            <PageLayout>
            <PageBlock column="main" blockId="retention">
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <Clock className="w-5 h-5 text-primary" />
                            <div>
                                <CardTitle><Trans>Data Retention</Trans></CardTitle>
                                <CardDescription>
                                    <Trans>Configure how long data is kept before automatic cleanup</Trans>
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="runs-days">
                                        <Trans>Pipeline Run History</Trans>
                                    </Label>
                                    <Input
                                        id="runs-days"
                                        type="number"
                                        min="0"
                                        max={String(RETENTION.MAX_DAYS)}
                                        placeholder={String(RETENTION.RUNS_DAYS)}
                                        value={runsDays}
                                        onChange={e => handleRunsDaysChange(e.target.value)}
                                        disabled={!canUpdate}
                                        onBlur={() => handleBlur('runsDays')}
                                        className={errors.runsDays && touched.runsDays ? 'border-destructive focus-visible:ring-destructive' : ''}
                                        aria-invalid={Boolean(errors.runsDays && touched.runsDays)}
                                        aria-describedby="runs-days-feedback"
                                        data-testid="settings-runs-retention-input"
                                    />
                                    <div id="runs-days-feedback">
                                        {errors.runsDays && touched.runsDays ? (
                                            <FieldError error={errors.runsDays} />
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                <Trans>Enter a whole number of days. Use 0 to keep completed runs indefinitely, or leave empty to use the configured server default.</Trans>
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="errors-days">
                                        <Trans>Error Records</Trans>
                                    </Label>
                                    <Input
                                        id="errors-days"
                                        type="number"
                                        min="0"
                                        max={String(RETENTION.MAX_DAYS)}
                                        placeholder={String(RETENTION.ERRORS_DAYS)}
                                        value={errorsDays}
                                        onChange={e => handleErrorsDaysChange(e.target.value)}
                                        disabled={!canUpdate}
                                        onBlur={() => handleBlur('errorsDays')}
                                        className={errors.errorsDays && touched.errorsDays ? 'border-destructive focus-visible:ring-destructive' : ''}
                                        aria-invalid={Boolean(errors.errorsDays && touched.errorsDays)}
                                        aria-describedby="errors-days-feedback"
                                        data-testid="settings-errors-retention-input"
                                    />
                                    <div id="errors-days-feedback">
                                        {errors.errorsDays && touched.errorsDays ? (
                                            <FieldError error={errors.errorsDays} />
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                <Trans>Enter a whole number of days. Use 0 to keep failed records indefinitely, or leave empty to use the configured server default.</Trans>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-3 bg-muted rounded-lg flex items-start gap-2">
                                <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
                                <div className="text-sm text-muted-foreground">
                                    <p>
                                        <Trans>Retention cleanup runs automatically. Older data is permanently deleted to free up database space.</Trans>
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
                                <CardTitle><Trans>Logging</Trans></CardTitle>
                                <CardDescription>
                                    <Trans>Configure what gets logged to the database for the dashboard</Trans>
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="log-level">
                                        <Trans>Log Persistence Level</Trans>
                                    </Label>
                                    <Select value={logLevel} onValueChange={handleLogLevelChange} disabled={isLoadingOptions || !canUpdate}>
                                        <SelectTrigger id="log-level" data-testid="settings-log-level-select">
                                            <SelectValue
                                                placeholder={isLoadingOptions
                                                    ? t`Loading...`
                                                    : t`Select level...`}
                                            />
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
                                    <Label htmlFor="logs-days">
                                        <Trans>Log Retention</Trans>
                                    </Label>
                                    <Input
                                        id="logs-days"
                                        type="number"
                                        min="0"
                                        max={String(RETENTION.MAX_DAYS)}
                                        placeholder="0"
                                        value={logsDays}
                                        onChange={e => handleLogsDaysChange(e.target.value)}
                                        disabled={!canUpdate}
                                        onBlur={() => handleBlur('logsDays')}
                                        className={errors.logsDays && touched.logsDays ? 'border-destructive focus-visible:ring-destructive' : ''}
                                        aria-invalid={Boolean(errors.logsDays && touched.logsDays)}
                                        aria-describedby="logs-days-feedback"
                                        data-testid="settings-logs-retention-input"
                                    />
                                    <div id="logs-days-feedback">
                                        {errors.logsDays && touched.logsDays ? (
                                            <FieldError error={errors.logsDays} />
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                <Trans>Enter a whole number of days. Use 0 or leave empty to keep log entries indefinitely.</Trans>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-3 bg-muted rounded-lg flex items-start gap-2">
                                <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
                                <div className="text-sm text-muted-foreground">
                                    <p>
                                        <strong><Trans>Console logging is always full</Trans></strong>
                                        {' — '}
                                        <Trans>This setting only controls what gets saved to the database and shown in the Log Explorer. Higher levels provide more visibility but use more database space.</Trans>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </PageBlock>
            </PageLayout>
        </Page>
    );
}
