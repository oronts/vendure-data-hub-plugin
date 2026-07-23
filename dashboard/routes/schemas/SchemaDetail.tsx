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
    createSchemaDocument,
    deleteSchemaDocument,
    schemaDetailDocument,
    updateSchemaDocument,
} from '../../hooks';
import { AllPermissionsGuard } from '../../components/shared';
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

function CreateSchemaPage() {
    const { i18n, t } = useLingui();
    const navigate = useNavigate();
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
                        disabled={!form.formState.isValid || createSchema.isPending}
                    >
                        <Trans>Create version</Trans>
                    </Button>
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="schema-create-form">
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
    const { form, submitHandler, entity, isPending, resetForm } = useDetailPage({
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
            <Link to={DETAIL_ROUTES.SCHEMA} params={{ id: 'new' }}>
                <Trans>Create version</Trans>
            </Link>
        </DropdownMenuItem>
    ), []);
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
                        {entity && <SchemaVersionHistory current={entity} />}
                        <section>
                            <h3 className="mb-3 text-sm font-medium"><Trans>Impact</Trans></h3>
                            {entity?.usedBy.length ? (
                                <div className="space-y-2">
                                    {entity.usedBy.map(usage => (
                                        <div
                                            key={`${usage.pipelineId}:${usage.stepKey}:${usage.revisionType}:${usage.revisionId ?? ''}:${usage.runId ?? ''}`}
                                            className="rounded-md border p-3 text-sm"
                                        >
                                            <Link
                                                to={DETAIL_ROUTES.PIPELINE}
                                                params={{ id: String(usage.pipelineId) }}
                                                className="font-medium hover:underline"
                                            >
                                                {usage.pipelineName}
                                            </Link>
                                            <p className="text-muted-foreground">
                                                {usage.stepKey} · {usage.stepType} · {usage.revisionType}
                                            </p>
                                            {usage.runId && (
                                                <p className="text-muted-foreground">
                                                    <Trans>Run</Trans> {usage.runId} · {usage.runStatus}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    <Trans>No pipeline references this version.</Trans>
                                </p>
                            )}
                        </section>
                    </div>
                </PageBlock>
            </PageLayout>
        </Page>
    );
}
