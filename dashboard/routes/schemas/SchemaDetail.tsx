import * as React from 'react';
import {
    Button,
    ConfirmationDialog,
    DashboardRouteDefinition,
    DetailFormGrid,
    DropdownMenuItem,
    Json,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    PermissionGuard,
    api,
    detailPageRouteLoader,
    useDetailPage,
    usePermissions,
} from '@vendure/dashboard';
import { Trans, useLingui } from '@lingui/react/macro';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    DataHubSchemaCompatibility,
} from '../../gql/graphql';
import type {
    CreateDataHubSchemaApiMutation,
    CreateDataHubSchemaInput,
    DeleteDataHubSchemaApiMutation,
} from '../../gql/graphql';
import {
    DATAHUB_NAV_LABELS,
    DATAHUB_PAGE_LABELS,
    DATAHUB_PERMISSIONS,
    DETAIL_ROUTES,
    ROUTES,
} from '../../constants';
import {
    assignSchemasToChannelDocument,
    createSchemaDocument,
    deleteSchemaDocument,
    removeSchemasFromChannelDocument,
    schemaDetailDocument,
    updateSchemaDocument,
    useSchema,
    useSchemaUsage,
} from '../../hooks';
import { AllPermissionsGuard, ManagedResourceChannels } from '../../components/shared';
import { getEntityLabel } from '../../utils';
import { getErrorMessage } from '../../../shared';
import { SchemaVersionHistory } from './SchemaVersionHistory';
import {
    DEFAULT_SCHEMA_DEFINITION,
    JsonTextField,
    ReadOnlyField,
    SchemaIdentityFields,
    formatJson,
    parseJsonObject,
    parseOptionalJsonObject,
} from './schema-form';
import type { CreateSchemaFormValues } from './schema-form';

const SCHEMA_DETAIL_PAGE_ID = 'data-hub-schema-detail';

type DashboardRoute = Parameters<DashboardRouteDefinition['component']>[0];

export const schemaDetail: DashboardRouteDefinition = {
    path: DETAIL_ROUTES.SCHEMA,
    loader: detailPageRouteLoader({
        pageId: SCHEMA_DETAIL_PAGE_ID,
        queryDocument: schemaDetailDocument,
        breadcrumb: (isNew, entity) => [
            { path: ROUTES.SCHEMAS, label: DATAHUB_NAV_LABELS.SCHEMAS },
            isNew
                ? DATAHUB_PAGE_LABELS.NEW_SCHEMA
                : <>{getEntityLabel(entity, 'schemaId')}</>,
        ],
    }),
    component: route => <SchemaDetailPermissionGate route={route} />,
};

function SchemaDetailPermissionGate({ route }: Readonly<{ route: DashboardRoute }>) {
    const creating = route.useParams().id === 'new';
    if (creating) {
        return (
            <AllPermissionsGuard requires={[
                DATAHUB_PERMISSIONS.READ_SCHEMA,
                DATAHUB_PERMISSIONS.CREATE_SCHEMA,
            ]}>
                <CreateSchemaPage />
            </AllPermissionsGuard>
        );
    }
    return (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.READ_SCHEMA]}>
            <ExistingSchemaPage route={route} />
        </PermissionGuard>
    );
}

export const schemaVersionCreate: DashboardRouteDefinition = {
    path: DETAIL_ROUTES.SCHEMA_VERSION,
    loader: () => ({ breadcrumb: DATAHUB_PAGE_LABELS.NEW_SCHEMA }),
    component: route => (
        <AllPermissionsGuard requires={[
            DATAHUB_PERMISSIONS.READ_SCHEMA,
            DATAHUB_PERMISSIONS.CREATE_SCHEMA,
        ]}>
            <CreateSchemaPage sourceId={String(route.useParams().id)} />
        </AllPermissionsGuard>
    ),
};

function CreateSchemaPage({ sourceId }: Readonly<{ sourceId?: string }>) {
    const { i18n, t } = useLingui();
    const navigate = useNavigate();
    const sourceSchema = useSchema(sourceId);
    const form = useForm<CreateSchemaFormValues, unknown, CreateSchemaFormValues>({
        defaultValues: {
            schemaId: '',
            version: '1.0.0',
            compatibility: DataHubSchemaCompatibility.BACKWARD,
        },
        mode: 'onChange',
    });
    const [definitionText, setDefinitionText] = React.useState(DEFAULT_SCHEMA_DEFINITION);
    const [metadataText, setMetadataText] = React.useState('');
    const initializedSource = React.useRef<string | undefined>(undefined);
    React.useEffect(() => {
        if (!sourceId || !sourceSchema.data || initializedSource.current === sourceId) return;
        form.reset({
            schemaId: sourceSchema.data.schemaId,
            version: '',
            compatibility: sourceSchema.data.compatibility,
        });
        setDefinitionText(formatJson(sourceSchema.data.definition));
        setMetadataText(formatJson(sourceSchema.data.metadata));
        initializedSource.current = sourceId;
    }, [form, sourceId, sourceSchema.data]);
    const sourceUnavailable = Boolean(sourceId) && (
        sourceSchema.isPending
        || sourceSchema.isError
        || sourceSchema.data == null
    );
    const createSchema = useMutation({
        mutationFn: (input: CreateDataHubSchemaInput) => api.mutate(
            createSchemaDocument,
            { input },
        ),
        onSuccess: async (result: CreateDataHubSchemaApiMutation) => {
            toast.success(t`Schema version created`);
            await navigate({
                to: `../$id`,
                params: { id: result.createDataHubSchema.id },
            });
        },
        onError: error => toast.error(t`Could not create schema version`, {
            description: getErrorMessage(error),
        }),
    });

    const submit = form.handleSubmit(values => {
        try {
            createSchema.mutate({
                ...values,
                definition: parseJsonObject(definitionText, {
                    invalidJson: t`Definition must be valid JSON`,
                    notObject: t`Definition must be a JSON object`,
                }),
                metadata: parseOptionalJsonObject(metadataText, {
                    invalidJson: t`Metadata must be valid JSON`,
                    notObject: t`Metadata must be a JSON object`,
                }),
            });
        } catch (error: unknown) {
            toast.error(t`Invalid schema JSON`, {
                description: getErrorMessage(error),
            });
        }
    });

    return (
        <Page
            pageId={SCHEMA_DETAIL_PAGE_ID}
            form={form}
            submitHandler={submit}
        >
            <PageTitle>{i18n._(DATAHUB_PAGE_LABELS.NEW_SCHEMA)}</PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <Button
                        type="submit"
                        disabled={
                            !form.formState.isValid
                            || createSchema.isPending
                            || sourceUnavailable
                        }
                    >
                        <Trans>Create version</Trans>
                    </Button>
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="schema-create-form">
                    {sourceId && sourceSchema.isPending && (
                        <p className="text-sm text-muted-foreground">
                            <Trans>Loading source schema…</Trans>
                        </p>
                    )}
                    {sourceId && sourceSchema.isError && (
                        <div className="mb-4 space-y-2 text-sm text-destructive">
                            <p><Trans>Could not load the source schema.</Trans></p>
                            <p className="text-xs">{getErrorMessage(sourceSchema.error)}</p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void sourceSchema.refetch()}
                            >
                                <Trans>Retry</Trans>
                            </Button>
                        </div>
                    )}
                    {sourceId && !sourceSchema.isPending && !sourceSchema.isError && !sourceSchema.data && (
                        <p className="mb-4 text-sm text-destructive">
                            <Trans>The source schema no longer exists.</Trans>
                        </p>
                    )}
                    <SchemaIdentityFields form={form} />
                    <JsonTextField
                        label={t`Definition`}
                        value={definitionText}
                        onChange={setDefinitionText}
                        required
                    />
                    <JsonTextField
                        label={t`Metadata`}
                        value={metadataText}
                        onChange={setMetadataText}
                    />
                </PageBlock>
            </PageLayout>
        </Page>
    );
}

function ExistingSchemaPage({ route }: Readonly<{ route: DashboardRoute }>) {
    const { t } = useLingui();
    const params = route.useParams();
    const navigate = useNavigate();
    const { hasPermissions } = usePermissions();
    const canUpdate = hasPermissions([DATAHUB_PERMISSIONS.UPDATE_SCHEMA]);
    const [metadataText, setMetadataText] = React.useState('');
    const [metadataValid, setMetadataValid] = React.useState(true);
    const { form, submitHandler, entity, isPending, resetForm, refreshEntity } = useDetailPage({
        pageId: SCHEMA_DETAIL_PAGE_ID,
        queryDocument: schemaDetailDocument,
        entityField: 'dataHubSchema',
        createDocument: createSchemaDocument,
        updateDocument: updateSchemaDocument,
        setValuesForUpdate: schema => ({
            id: schema.id,
            metadata: schema.metadata ?? null,
        }),
        transformCreateInput: input => input,
        transformUpdateInput: input => ({
            id: input.id,
            metadata: input.metadata ?? null,
        }),
        params: { id: params.id },
        onSuccess: () => {
            toast.success(t`Schema metadata updated`);
            resetForm();
        },
        onError: error => toast.error(t`Could not update schema metadata`, {
            description: getErrorMessage(error),
        }),
    });
    React.useEffect(() => {
        setMetadataText(formatJson(entity?.metadata));
    }, [entity?.metadata]);

    const deleteSchema = useMutation({
        mutationFn: async () => {
            const result = await api.mutate(
                deleteSchemaDocument,
                { id: params.id },
            ) as DeleteDataHubSchemaApiMutation;
            const response = result.deleteDataHubSchema;
            if (response.result !== 'DELETED') {
                throw new Error(response.message ?? t`Schema version could not be deleted`);
            }
            return result;
        },
        onSuccess: async () => {
            toast.success(t`Schema version deleted`);
            await navigate({ to: ROUTES.SCHEMAS });
        },
        onError: error => toast.error(t`Could not delete schema version`, {
            description: getErrorMessage(error),
        }),
    });
    const CreateVersionMenuItem = React.useCallback(() => (
        <DropdownMenuItem asChild>
            <Link
                to={DETAIL_ROUTES.SCHEMA_VERSION}
                params={{ id: String(entity?.id ?? params.id) }}
            >
                <Trans>Create version</Trans>
            </Link>
        </DropdownMenuItem>
    ), [entity?.id, params.id]);
    const DeleteVersionMenuItem = React.useCallback(() => (
        <ConfirmationDialog
            title={t`Delete schema version?`}
            description={t`Deletion is blocked when a pipeline, revision, or run snapshot still references this version.`}
            confirmText={t`Delete version`}
            onConfirm={() => deleteSchema.mutate()}
        >
            <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={event => event.preventDefault()}
            >
                <Trash2 className="h-4 w-4" />
                <Trans>Delete</Trans>
            </DropdownMenuItem>
        </ConfirmationDialog>
    ), [deleteSchema, t]);

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        try {
            const metadata = parseOptionalJsonObject(metadataText, {
                invalidJson: t`Metadata must be valid JSON`,
                notObject: t`Metadata must be a JSON object`,
            });
            form.setValue('metadata', metadata ?? undefined, {
                shouldDirty: true,
                shouldValidate: true,
            });
            setMetadataValid(true);
            submitHandler(event);
        } catch (error: unknown) {
            event.preventDefault();
            setMetadataValid(false);
            toast.error(t`Invalid metadata JSON`, {
                description: getErrorMessage(error),
            });
        }
    };

    return (
        <Page
            pageId={SCHEMA_DETAIL_PAGE_ID}
            form={form}
            submitHandler={submit}
            entity={entity}
        >
            <PageTitle>{entity ? `${entity.schemaId} ${entity.version}` : ''}</PageTitle>
            <PageActionBar>
                <PageActionBarRight
                    dropdownMenuItems={[
                        {
                            component: CreateVersionMenuItem,
                            requiresPermission: DATAHUB_PERMISSIONS.CREATE_SCHEMA,
                        },
                        ...(entity ? [{
                            component: DeleteVersionMenuItem,
                            requiresPermission: DATAHUB_PERMISSIONS.DELETE_SCHEMA,
                        }] : []),
                    ]}
                >
                    {canUpdate && (
                        <Button
                            type="submit"
                            disabled={isPending || !metadataValid}
                        >
                            <Trans>Save</Trans>
                        </Button>
                    )}
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="schema-contract">
                    <DetailFormGrid>
                        <ReadOnlyField label={t`Schema ID`} value={entity?.schemaId} />
                        <ReadOnlyField label={t`Version`} value={entity?.version} />
                        <ReadOnlyField label={t`Compatibility`} value={entity?.compatibility} />
                    </DetailFormGrid>
                    <div className="mt-6 space-y-2">
                        <h3 className="text-sm font-medium"><Trans>Definition</Trans></h3>
                        <Json value={entity?.definition ?? {}} />
                    </div>
                    <div className="mt-6">
                        <JsonTextField
                            label={t`Metadata`}
                            value={metadataText}
                            onChange={value => {
                                setMetadataText(value);
                                setMetadataValid(true);
                            }}
                            disabled={!canUpdate}
                        />
                    </div>
                </PageBlock>
                <PageBlock column="side" blockId="schema-impact">
                    <div className="space-y-6">
                        {entity && (
                            <ManagedResourceChannels
                                channels={entity.channels}
                                entityLabel={`${entity.schemaId} ${entity.version}`}
                                canUpdate={canUpdate}
                                onAssign={channelId => api.mutate(
                                    assignSchemasToChannelDocument,
                                    { input: { schemaIds: [String(entity.id)], channelId } },
                                )}
                                onRemove={channelId => api.mutate(
                                    removeSchemasFromChannelDocument,
                                    { input: { schemaIds: [String(entity.id)], channelId } },
                                )}
                                onChanged={refreshEntity}
                            />
                        )}
                        {entity && <SchemaVersionHistory current={entity} />}
                        <section>
                            <h3 className="mb-3 text-sm font-medium"><Trans>Impact</Trans></h3>
                            {entity && <SchemaImpact schemaId={String(entity.id)} />}
                        </section>
                    </div>
                </PageBlock>
            </PageLayout>
        </Page>
    );
}

function SchemaImpact({ schemaId }: Readonly<{ schemaId: string }>) {
    const usage = useSchemaUsage(schemaId);

    if (usage.isPending) {
        return <p className="text-sm text-muted-foreground"><Trans>Loading impact…</Trans></p>;
    }
    if (usage.isError) {
        return (
            <div className="space-y-2 text-sm text-destructive">
                <p><Trans>Could not load schema impact.</Trans></p>
                <p className="text-xs">{getErrorMessage(usage.error)}</p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void usage.refetch()}
                >
                    <Trans>Retry</Trans>
                </Button>
            </div>
        );
    }
    if (!usage.data?.length) {
        return (
            <p className="text-sm text-muted-foreground">
                <Trans>No pipeline references this version.</Trans>
            </p>
        );
    }

    return (
        <div className="space-y-2">
            {usage.data.map(reference => (
                <div
                    key={`${reference.pipelineId}:${reference.stepKey}:${reference.revisionType}:${reference.revisionId ?? ''}:${reference.runId ?? ''}`}
                    className="rounded-md border p-3 text-sm"
                >
                    <Link
                        to={DETAIL_ROUTES.PIPELINE}
                        params={{ id: String(reference.pipelineId) }}
                        className="font-medium hover:underline"
                    >
                        {reference.pipelineName}
                    </Link>
                    <p className="text-muted-foreground">
                        {reference.stepKey} · {reference.stepType} · {reference.revisionType}
                    </p>
                    {reference.runId && (
                        <p className="text-muted-foreground">
                            <Trans>Run</Trans> {reference.runId} · {reference.runStatus}
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}
