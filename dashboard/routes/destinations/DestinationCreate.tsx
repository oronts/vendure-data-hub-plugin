import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    DashboardRouteDefinition,
    Input,
    Label,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    PermissionGuard,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    useChannel,
} from '@vendure/dashboard';
import { Link, useNavigate } from '@tanstack/react-router';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '../../../shared';
import { SchemaFormRenderer } from '../../components/shared';
import { ErrorState, LoadingState } from '../../components/shared/feedback';
import {
    DATAHUB_NAV_LABELS,
    DATAHUB_PAGE_LABELS,
    DATAHUB_PERMISSIONS,
    ROUTES,
} from '../../constants';
import { useConfigOptions } from '../../hooks/api/use-config-options';
import { useRegisterExportDestination } from '../../hooks/api/use-destinations';
import { mapAdapterSchema } from '../../utils';
import {
    createDestinationConfig,
    createManagedDestinationDraft,
    isManagedDestinationType,
    prepareManagedDestinationInput,
    validateManagedDestinationDraft,
    type DestinationMessageFormatter,
    type ManagedDestinationDraft,
} from './destination-form';

const DESTINATION_FORM_ID = 'data-hub-destination-create-form';

export const destinationCreate: DashboardRouteDefinition = {
    path: `${ROUTES.DESTINATIONS}/new`,
    loader: () => ({
        breadcrumb: [
            { path: ROUTES.DESTINATIONS, label: DATAHUB_NAV_LABELS.DESTINATIONS },
            DATAHUB_PAGE_LABELS.NEW_DESTINATION,
        ],
    }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.MANAGE_DESTINATIONS]}>
            <DestinationCreatePage />
        </PermissionGuard>
    ),
};

function DestinationCreatePage() {
    const { i18n, t } = useLingui();
    const navigate = useNavigate();
    const { activeChannel } = useChannel();
    const configOptions = useConfigOptions();
    const registerDestination = useRegisterExportDestination();
    const schemas = React.useMemo(
        () => configOptions.data?.destinationSchemas ?? [],
        [configOptions.data?.destinationSchemas],
    );
    const destinationTypes = React.useMemo(
        () => configOptions.data?.destinationTypes ?? [],
        [configOptions.data?.destinationTypes],
    );
    const initialSchema = schemas.find(schema => schema.type === 'LOCAL');
    const [draft, setDraft] = React.useState<ManagedDestinationDraft>(() =>
        createManagedDestinationDraft('LOCAL', initialSchema),
    );
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const formatMessage = React.useCallback<DestinationMessageFormatter>(
        (id, values) => i18n._(id, values ? { ...values } : undefined),
        [i18n],
    );

    const selectedSchema = React.useMemo(
        () => schemas.find(schema => schema.type === draft.destination.type),
        [draft.destination.type, schemas],
    );
    const adapterSchema = React.useMemo(
        () => mapAdapterSchema({ fields: selectedSchema?.fields ?? [] }),
        [selectedSchema?.fields],
    );
    const destinationValues = React.useMemo(() => {
        if (!selectedSchema?.configKey) return {};
        const destinationRecord: Record<string, unknown> = { ...draft.destination };
        const value = destinationRecord[selectedSchema.configKey];
        return value && typeof value === 'object'
            ? value as Record<string, unknown>
            : {};
    }, [draft.destination, selectedSchema?.configKey]);
    const hasSelectedConfig = selectedSchema?.configKey
        ? Object.prototype.hasOwnProperty.call(draft.destination, selectedSchema.configKey)
        : true;

    React.useEffect(() => {
        if (!selectedSchema || hasSelectedConfig) return;
        setDraft(current => ({
            ...current,
            destination: createDestinationConfig(current.destination.type, selectedSchema),
        }));
    }, [hasSelectedConfig, selectedSchema]);

    const handleTypeChange = React.useCallback((value: string) => {
        if (!isManagedDestinationType(value)) return;
        const schema = schemas.find(candidate => candidate.type === value);
        setDraft(current => ({
            ...current,
            destination: createDestinationConfig(value, schema),
        }));
        setErrors({});
    }, [schemas]);

    const handleConfigChange = React.useCallback((values: Record<string, unknown>) => {
        if (!selectedSchema?.configKey) return;
        setDraft(current => ({
            ...current,
            destination: {
                ...current.destination,
                [selectedSchema.configKey]: values,
            } as typeof current.destination,
        }));
        setErrors(current => {
            return Object.fromEntries(
                Object.entries(current).filter(([key]) => key === 'id' || key === 'name'),
            );
        });
    }, [selectedSchema?.configKey]);

    const handleSubmit = React.useCallback((event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const validation = validateManagedDestinationDraft(
            draft,
            selectedSchema,
            formatMessage,
        );
        setErrors(validation.errors);
        if (!validation.isValid || !selectedSchema) {
            toast.error(t`Fix the highlighted destination fields`);
            return;
        }

        registerDestination.mutate(
            prepareManagedDestinationInput(draft, selectedSchema),
            {
                onSuccess: result => {
                    if (!result.success) {
                        toast.error(t`Failed to create destination`);
                        return;
                    }
                    toast.success(t`Destination created`);
                    void navigate({ to: ROUTES.DESTINATIONS }).catch(error => {
                        toast.error(t`Destination created, but navigation failed`, {
                            description: getErrorMessage(error),
                        });
                    });
                },
                onError: error => toast.error(
                    t`Failed to create destination`,
                    {
                        description: getErrorMessage(error),
                    },
                ),
            },
        );
    }, [draft, formatMessage, navigate, registerDestination, selectedSchema, t]);

    if (configOptions.isError) {
        return (
            <Page pageId="data-hub-destination-create">
                <PageTitle>{i18n._(DATAHUB_PAGE_LABELS.NEW_DESTINATION)}</PageTitle>
                <PageLayout>
                    <PageBlock column="main" blockId="error">
                        <ErrorState
                            title={t`Failed to load destination schemas`}
                            message={getErrorMessage(configOptions.error)}
                            onRetry={() => void configOptions.refetch()}
                        />
                    </PageBlock>
                </PageLayout>
            </Page>
        );
    }

    if (configOptions.isLoading) {
        return (
            <Page pageId="data-hub-destination-create">
                <PageTitle>{i18n._(DATAHUB_PAGE_LABELS.NEW_DESTINATION)}</PageTitle>
                <PageLayout>
                    <PageBlock column="main" blockId="loading">
                        <LoadingState
                            type="form"
                            rows={6}
                            message={t`Loading destination configuration...`}
                        />
                    </PageBlock>
                </PageLayout>
            </Page>
        );
    }

    const channelLabel = activeChannel?.code ?? t`active channel`;

    return (
        <Page pageId="data-hub-destination-create">
            <PageTitle>{i18n._(DATAHUB_PAGE_LABELS.NEW_DESTINATION)}</PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <Button variant="outline" asChild>
                        <Link to={ROUTES.DESTINATIONS}>
                            {t`Cancel`}
                        </Link>
                    </Button>
                    <Button
                        type="submit"
                        form={DESTINATION_FORM_ID}
                        disabled={registerDestination.isPending || !selectedSchema}
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {registerDestination.isPending ? t`Creating...` : t`Create destination`}
                    </Button>
                </PageActionBarRight>
            </PageActionBar>

            <form id={DESTINATION_FORM_ID} onSubmit={handleSubmit} noValidate>
                <PageLayout>
                <PageBlock column="main" blockId="destination-identity">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t`Destination`}</CardTitle>
                            <CardDescription>
                                {t`This destination belongs to channel ${channelLabel}.`}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="destination-id">
                                        {t`ID`}
                                    </Label>
                                    <Input
                                        id="destination-id"
                                        value={draft.id}
                                        onChange={event => {
                                            setDraft(current => ({ ...current, id: event.target.value }));
                                            setErrors(current => {
                                                const { id: _id, ...remaining } = current;
                                                return remaining;
                                            });
                                        }}
                                        placeholder={t`erp-api`}
                                        aria-invalid={Boolean(errors.id)}
                                        aria-describedby={errors.id ? 'destination-id-error' : 'destination-id-help'}
                                    />
                                    {errors.id ? (
                                        <p id="destination-id-error" role="alert" className="text-xs text-destructive">{errors.id}</p>
                                    ) : (
                                        <p id="destination-id-help" className="text-xs text-muted-foreground">
                                            {t`Unique identifier within the active channel.`}
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="destination-name">
                                        {t`Name`}
                                    </Label>
                                    <Input
                                        id="destination-name"
                                        value={draft.name}
                                        onChange={event => {
                                            setDraft(current => ({ ...current, name: event.target.value }));
                                            setErrors(current => {
                                                const { name: _name, ...remaining } = current;
                                                return remaining;
                                            });
                                        }}
                                        placeholder={t`ERP API`}
                                        aria-invalid={Boolean(errors.name)}
                                        aria-describedby={errors.name ? 'destination-name-error' : undefined}
                                    />
                                    {errors.name && (
                                        <p id="destination-name-error" role="alert" className="text-xs text-destructive">{errors.name}</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                                <div className="space-y-2">
                                    <Label htmlFor="destination-type">
                                        {t`Destination type`}
                                    </Label>
                                    <Select value={draft.destination.type} onValueChange={handleTypeChange}>
                                        <SelectTrigger id="destination-type">
                                            <SelectValue
                                                placeholder={t`Select a destination type`}
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {destinationTypes
                                                .filter(option => isManagedDestinationType(option.value))
                                                .map(option => (
                                                    <SelectItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center justify-between rounded-lg border p-3">
                                    <div>
                                        <Label htmlFor="destination-enabled">
                                            {t`Enabled`}
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            {t`Disabled destinations cannot receive exported data.`}
                                        </p>
                                    </div>
                                    <Switch
                                        id="destination-enabled"
                                        checked={draft.enabled}
                                        onCheckedChange={enabled => setDraft(current => ({
                                            ...current,
                                            enabled,
                                        }))}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </PageBlock>

                <PageBlock column="main" blockId="destination-configuration">
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {selectedSchema?.label
                                    ?? t`Configuration unavailable`}
                            </CardTitle>
                            <CardDescription>
                                {t`Credentials must reference secrets; plaintext credentials are not stored here.`}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {selectedSchema ? (
                                <SchemaFormRenderer
                                    schema={adapterSchema}
                                    values={destinationValues}
                                    onChange={handleConfigChange}
                                    errors={errors}
                                />
                            ) : (
                                <ErrorState
                                    title={t`Destination configuration unavailable`}
                                    message={t`No executable schema is registered for the selected destination type.`}
                                />
                            )}
                        </CardContent>
                    </Card>
                </PageBlock>
                </PageLayout>
            </form>
        </Page>
    );
}
