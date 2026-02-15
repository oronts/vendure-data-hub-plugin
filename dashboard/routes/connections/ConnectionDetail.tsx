import * as React from 'react';
import { Button, DashboardRouteDefinition, DetailFormGrid, FormFieldWrapper, Input, Page, PageActionBar, PageActionBarRight, PageBlock, PageLayout, PageTitle, detailPageRouteLoader, useDetailPage, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, PermissionGuard } from '@vendure/dashboard';
import { AnyRoute, useNavigate } from '@tanstack/react-router';
import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import {
    ConnectionConfigEditor,
    CONNECTION_TYPE_OPTIONS,
    createDefaultConnectionConfig,
    normalizeConnectionConfig,
} from '../../components/common/ConnectionConfigEditor';
import type { UIConnectionType } from '../../types';
import { CODE_PATTERN } from '../../utils/FormValidation';
import { FieldError } from '../../components/common';
import { QUERY_LIMITS, DATAHUB_PERMISSIONS, ROUTES, CONNECTION_DEFAULT_TYPE, SELECT_WIDTHS, TOAST_CONNECTION, ERROR_MESSAGES } from '../../constants';
import {
    connectionDetailDocument,
    createConnectionDocument,
    updateConnectionDocument,
    useSecrets,
} from '../../hooks';


export const connectionDetail: DashboardRouteDefinition = {
    path: `${ROUTES.CONNECTIONS}/$id`,
    loader: detailPageRouteLoader({ queryDocument: connectionDetailDocument, breadcrumb: (isNew, entity) => ['Data Hub', 'Connections', isNew ? 'New connection' : (entity?.code ?? '')] }),
    component: route => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.MANAGE_CONNECTIONS]}>
            <ConnectionDetailPage route={route} />
        </PermissionGuard>
    ),
};

function ConnectionDetailPage({ route }: { route: AnyRoute }) {
    const params = route.useParams();
    const navigate = useNavigate();
    const creating = params.id === 'new';

    const { data: secretsData, isError: secretsError } = useSecrets({ take: QUERY_LIMITS.SECRETS_LIST });

    React.useEffect(() => {
        if (secretsError) {
            toast.error(TOAST_CONNECTION.SECRETS_LOAD_ERROR);
        }
    }, [secretsError]);

    const secretOptions = (secretsData?.items ?? []).map(item => ({
        code: item.code,
        provider: item.provider ?? undefined,
    }));

    const { form, submitHandler, entity, isPending, resetForm } = useDetailPage({
        queryDocument: connectionDetailDocument,
        createDocument: createConnectionDocument,
        updateDocument: updateConnectionDocument,
        setValuesForCreate: () => ({
            code: '',
            type: CONNECTION_DEFAULT_TYPE,
            config: createDefaultConnectionConfig(CONNECTION_DEFAULT_TYPE),
        }),
        setValuesForUpdate: s => {
            const type = (s?.type ?? CONNECTION_DEFAULT_TYPE) as UIConnectionType;
            return {
                id: s?.id ?? '',
                code: s?.code ?? '',
                type,
                config: normalizeConnectionConfig(type, s?.config ?? {}),
            };
        },
        params: { id: params.id },
        onSuccess: async data => {
            toast.success(TOAST_CONNECTION.SAVE_SUCCESS);
            resetForm();
            if (creating) {
                await navigate({ to: `../$id`, params: { id: data.id } });
            }
        },
        onError: err => {
            toast.error(TOAST_CONNECTION.SAVE_ERROR, {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        },
    });

    const configCacheRef = React.useRef<Record<string, Record<string, unknown>>>({});

    React.useEffect(() => {
        if (!entity) {
            return;
        }
        const type = (entity.type ?? form.getValues('type') ?? CONNECTION_DEFAULT_TYPE) as UIConnectionType;
        const normalized = normalizeConnectionConfig(type, entity.config ?? {});
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

    const watchedType = useWatch({ control: form.control, name: 'type', defaultValue: entity?.type || CONNECTION_DEFAULT_TYPE });
    const connectionType = (watchedType || entity?.type || CONNECTION_DEFAULT_TYPE) as UIConnectionType;

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
                                required: ERROR_MESSAGES.CODE_REQUIRED,
                                pattern: {
                                    value: CODE_PATTERN,
                                    message: ERROR_MESSAGES.CODE_PATTERN,
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
                            rules={{ required: ERROR_MESSAGES.CONNECTION_TYPE_REQUIRED }}
                            render={({ field, fieldState }) => (
                                <div>
                                <Select
                                    value={
                                        (typeof field.value === 'string' && field.value.length > 0)
                                            ? field.value
                                            : String(entity?.type ?? CONNECTION_DEFAULT_TYPE)
                                    }
                                    onValueChange={val => {
                                        const prevType = (field.value as UIConnectionType | undefined) ?? (entity?.type as UIConnectionType | undefined);
                                        const nextType = val as UIConnectionType;
                                        const prevConfig = form.getValues('config') as Record<string, unknown> | undefined;
                                        if (prevType && prevConfig && typeof prevConfig === 'object') {
                                            configCacheRef.current[prevType] = prevConfig;
                                        }
                                        field.onChange(nextType);
                                        const restored = configCacheRef.current[nextType] ?? createDefaultConnectionConfig(nextType);
                                        form.setValue('config', restored, { shouldDirty: true });
                                    }}
                                >
                                    <SelectTrigger className={SELECT_WIDTHS.CONNECTION_TYPE}>
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
