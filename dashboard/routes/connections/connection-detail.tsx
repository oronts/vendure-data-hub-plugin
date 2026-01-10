import * as React from 'react';
import { Button, DashboardRouteDefinition, DetailFormGrid, FormFieldWrapper, Input, Page, PageActionBar, PageActionBarRight, PageBlock, PageLayout, PageTitle, detailPageRouteLoader, useDetailPage, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, PermissionGuard } from '@vendure/dashboard';
import { graphql } from '@/gql';
import { AnyRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import {
    ConnectionConfigEditor,
    CONNECTION_TYPE_OPTIONS,
    ConnectionType,
    createDefaultConnectionConfig,
    normalizeConnectionConfig,
} from '../../components/common/connection-config-editor';
import { api } from '@vendure/dashboard';
import { CODE_PATTERN } from '../../utils/form-validation';
import { FieldError } from '../../components/common/validation-feedback';

const detailDocument = graphql(`
    query DataHubConnectionDetail($id: ID!) {
        dataHubConnection(id: $id) {
            id
            code
            type
            config
        }
    }
`);
const createDocument = graphql(`
    mutation CreateDataHubConnection($input: CreateDataHubConnectionInput!) { createDataHubConnection(input: $input) { id } }
`);
const updateDocument = graphql(`
    mutation UpdateDataHubConnection($input: UpdateDataHubConnectionInput!) { updateDataHubConnection(input: $input) { id } }
`);

const secretCodesDocument = graphql(`
    query DataHubConnectionSecretCodes($options: DataHubSecretListOptions) {
        dataHubSecrets(options: $options) {
            items { id code provider }
        }
    }
`);

export const connectionDetail: DashboardRouteDefinition = {
    path: '/data-hub/connections/$id',
    loader: detailPageRouteLoader({ queryDocument: detailDocument, breadcrumb: (isNew, entity) => ['Data Hub', 'Connections', isNew ? 'New connection' : (entity?.code ?? '')] }),
    component: route => (
        <PermissionGuard requires={['ManageDataHubConnections']}>
            <ConnectionDetailPage route={route} />
        </PermissionGuard>
    ),
};

function ConnectionDetailPage({ route }: { route: AnyRoute }) {
    const params = route.useParams();
    const navigate = useNavigate();
    const creating = params.id === 'new';

    const { data: secretData } = useQuery({
        queryKey: ['DataHubConnectionSecretCodes'],
        queryFn: async () => {
            try {
                return await api.query(secretCodesDocument, { options: { take: 200 } });
            } catch (err) {
                return null;
            }
        },
        staleTime: 60 * 1000,
    });

    const secretOptions = (secretData?.dataHubSecrets?.items ?? []).map(item => ({
        code: item.code,
        provider: item.provider ?? undefined,
    }));

    const { form, submitHandler, entity, isPending, resetForm } = useDetailPage({
        queryDocument: detailDocument,
        createDocument,
        updateDocument,
        setValuesForCreate: () => ({
            code: '',
            type: 'http',
            config: createDefaultConnectionConfig('http'),
        }),
        setValuesForUpdate: s => {
            const type = (s?.type ?? 'http') as ConnectionType;
            return {
                id: s?.id ?? '',
                code: s?.code ?? '',
                type,
                config: normalizeConnectionConfig(type, s?.config ?? {}),
            };
        },
        params: { id: params.id },
        onSuccess: async data => {
            toast('Connection saved successfully');
            resetForm();
            if (creating) {
                await navigate({ to: `../$id`, params: { id: data.id } });
            }
        },
        onError: err => {
            toast('Failed to save connection', {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        },
    });

    // Cache per-type configs so toggling type and back restores previous values
    const configCacheRef = React.useRef<Record<string, Record<string, unknown>>>({});

    React.useEffect(() => {
        if (!entity) {
            return;
        }
        const type = (entity.type ?? form.getValues('type') ?? 'http') as ConnectionType;
        const normalized = normalizeConnectionConfig(type, entity.config ?? {});
        // Prime the cache with the server config for this type
        configCacheRef.current[type] = normalized as Record<string, unknown>;
        form.reset(
            {
                id: entity.id ?? '',
                code: entity.code ?? '',
                type,
                config: normalized,
            },
            { keepDirty: false, keepTouched: false },
        );
    }, [entity?.id]);

    const watchedType = useWatch({ control: form.control, name: 'type', defaultValue: entity?.type || 'http' });
    const connectionType = (watchedType || entity?.type || 'http') as ConnectionType;

    return (
        <Page pageId="data-hub-connection-detail" form={form} submitHandler={submitHandler}>
            <PageTitle>{creating ? 'New Connection' : (entity?.code ?? '')}</PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <Button type="submit" disabled={!form.formState.isDirty || !form.formState.isValid || isPending}>
                        {creating ? 'Create' : 'Update'}
                    </Button>
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="connection-form">
                    <DetailFormGrid>
                        <FormFieldWrapper
                            name="code"
                            label="Code"
                            control={form.control}
                            rules={{
                                required: 'Code is required',
                                pattern: {
                                    value: CODE_PATTERN,
                                    message: 'Must start with a letter and contain only letters, numbers, hyphens, and underscores',
                                },
                            }}
                            render={({ field, fieldState }) => (
                                <div>
                                    <Input
                                        {...field}
                                        placeholder="my-connection"
                                        className={fieldState.error ? 'border-destructive focus-visible:ring-destructive' : ''}
                                    />
                                    <FieldError error={fieldState.error?.message} touched={fieldState.isTouched} />
                                    {!fieldState.error && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Unique identifier for this connection
                                        </p>
                                    )}
                                </div>
                            )}
                        />
                        <FormFieldWrapper
                            name="type"
                            label="Connection Type"
                            control={form.control}
                            rules={{ required: 'Connection type is required' }}
                            render={({ field, fieldState }) => (
                                <div>
                                <Select
                                    value={
                                        (typeof field.value === 'string' && field.value.length > 0)
                                            ? field.value
                                            : String(entity?.type ?? 'http')
                                    }
                                    onValueChange={val => {
                                        const prevType = (field.value as ConnectionType | undefined) ?? (entity?.type as ConnectionType | undefined);
                                        const nextType = val as ConnectionType;
                                        // Stash current config under previous type key
                                        const prevConfig = form.getValues('config') as Record<string, unknown> | undefined;
                                        if (prevType && prevConfig && typeof prevConfig === 'object') {
                                            configCacheRef.current[prevType] = prevConfig;
                                        }
                                        // Update type field first
                                        field.onChange(nextType);
                                        // Restore cached config for new type, or defaults if none
                                        const restored = configCacheRef.current[nextType] ?? createDefaultConnectionConfig(nextType);
                                        form.setValue('config', restored, { shouldDirty: true });
                                    }}
                                >
                                    <SelectTrigger className="w-[250px]">
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CONNECTION_TYPE_OPTIONS.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FieldError error={fieldState.error?.message} touched={fieldState.isTouched} />
                                </div>
                            )}
                        />
                    </DetailFormGrid>

                    <div className="mt-6">
                        <h3 className="text-sm font-medium mb-4">Connection Settings</h3>
                        <FormFieldWrapper
                            name="config"
                            label=""
                            control={form.control}
                            render={({ field }) => {
                                const serverConfig = normalizeConnectionConfig(connectionType, entity?.config ?? {});
                                const effectiveConfig = (field.value && typeof field.value === 'object')
                                    ? (field.value as Record<string, unknown>)
                                    : serverConfig;
                                return (
                                    <ConnectionConfigEditor
                                        type={connectionType}
                                        config={effectiveConfig}
                                        onChange={field.onChange}
                                        secretOptions={secretOptions}
                                    />
                                );
                            }}
                        />
                    </div>
                </PageBlock>
            </PageLayout>
        </Page>
    );
}
