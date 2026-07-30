import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button, DashboardRouteDefinition, DetailFormGrid, FormFieldWrapper, Input, Page, PageActionBar, PageActionBarRight, PageBlock, PageLayout, PageTitle, api, detailPageRouteLoader, useDetailPage, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, PermissionGuard } from '@vendure/dashboard';
import { useNavigate } from '@tanstack/react-router';
import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import {
    ConnectionConfigEditor,
    createDefaultConnectionConfig,
    normalizeConnectionConfig,
} from '../../components/common';
import { serializeConnectionConfig } from '../../components/common/connection-config';
import { validateConnectionConfigDraft } from '../../components/common/connection-config-validation';
import type { UIConnectionType } from '../../types';
import { CONFIGURATION_SOURCE, getErrorMessage } from '../../../shared';
import { CODE_PATTERN, getEntityLabel } from '../../utils';
import { FieldError } from '../../components/common';
import { DATAHUB_NAV_LABELS, DATAHUB_PAGE_LABELS, DATAHUB_PERMISSIONS, DETAIL_ROUTES, ROUTES, CONNECTION_DEFAULT_TYPE, SELECT_WIDTHS } from '../../constants';
import {
    connectionDetailDocument,
    createConnectionDocument,
    assignConnectionsToChannelDocument,
    removeConnectionsFromChannelDocument,
    updateConnectionDocument,
    useConnectionSchemas,
} from '../../hooks';
import type { ConnectionSchema } from '../../hooks';
import { ManagedResourceChannels } from '../../components/shared';


export const connectionDetail: DashboardRouteDefinition = {
    path: DETAIL_ROUTES.CONNECTION,
    loader: detailPageRouteLoader({
        pageId: 'data-hub-connection-detail',
        queryDocument: connectionDetailDocument,
        breadcrumb: (isNew, entity) => [
            { path: ROUTES.CONNECTIONS, label: DATAHUB_NAV_LABELS.CONNECTIONS },
            isNew
                ? DATAHUB_PAGE_LABELS.NEW_CONNECTION
                : <>{getEntityLabel(entity, 'code')}</>,
        ],
    }),
    component: route => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.MANAGE_CONNECTIONS]}>
            <ConnectionDetailPage route={route} />
        </PermissionGuard>
    ),
};

type DashboardRoute = Parameters<DashboardRouteDefinition['component']>[0];

function ConnectionDetailPage({ route }: { route: DashboardRoute }) {
    const { i18n, t } = useLingui();
    const fieldIdPrefix = React.useId();
    const fieldIds = {
        codeLabel: `${fieldIdPrefix}-code-label`,
        codeDescription: `${fieldIdPrefix}-code-description`,
        typeLabel: `${fieldIdPrefix}-type-label`,
    } as const;
    const params = route.useParams();
    const navigate = useNavigate();
    const creating = params.id === 'new';

    const { schemas: connectionSchemas } = useConnectionSchemas();
    const connectionTypeOptions = React.useMemo(
        () => connectionSchemas.map(schema => ({
            value: schema.type,
            label: schema.label,
        })),
        [connectionSchemas],
    );
    const { form, submitHandler, entity, isPending, resetForm, refreshEntity } = useDetailPage({
        pageId: 'data-hub-connection-detail',
        queryDocument: connectionDetailDocument,
        entityField: 'dataHubConnection',
        createDocument: createConnectionDocument,
        updateDocument: updateConnectionDocument,
        setValuesForUpdate: s => {
            const type = (s?.type ?? CONNECTION_DEFAULT_TYPE) as UIConnectionType;
            return {
                id: s?.id ?? '',
                code: s?.code ?? '',
                type,
                config: normalizeConnectionConfig(type, s?.config ?? {}, connectionSchemas),
            };
        },
        transformCreateInput: input => prepareConnectionInput(input, connectionSchemas),
        transformUpdateInput: input => prepareConnectionInput(input, connectionSchemas),
        params: { id: params.id },
        onSuccess: async data => {
            toast.success(t`Connection saved successfully`);
            resetForm();
            if (creating && typeof data === 'object' && data !== null && 'id' in data) {
                await navigate({ to: `../$id`, params: { id: data.id } });
            }
        },
        onError: err => {
            toast.error(t`Failed to save connection`, {
                description: getErrorMessage(err),
            });
        },
    });

    const configCaches = React.useRef(
        new Map<string, Record<string, Record<string, unknown>>>(),
    );
    let configCache = configCaches.current.get(params.id);
    if (!configCache) {
        configCache = {};
        configCaches.current.set(params.id, configCache);
    }

    React.useEffect(() => {
        if (creating && !form.getValues('type')) {
            form.setValue('type', CONNECTION_DEFAULT_TYPE, { shouldDirty: false, shouldValidate: true });
        }
    }, [creating, form]);

    React.useEffect(() => {
        if (!entity) {
            return;
        }
        const type = (entity.type ?? form.getValues('type') ?? CONNECTION_DEFAULT_TYPE) as UIConnectionType;
        const normalized = normalizeConnectionConfig(
            type,
            entity.config ?? {},
            connectionSchemas,
        );
        configCache[type] = normalized as Record<string, unknown>;
        form.reset(
            {
                id: entity.id ?? '',
                code: entity.code ?? '',
                type,
                config: normalized,
            },
            { keepDirty: false, keepTouched: false },
        );
    }, [configCache, connectionSchemas, entity, form]);

    const watchedType = useWatch({ control: form.control, name: 'type', defaultValue: entity?.type || CONNECTION_DEFAULT_TYPE });
    const connectionType = (watchedType || entity?.type || CONNECTION_DEFAULT_TYPE) as UIConnectionType;
    const watchedConfig = useWatch({
        control: form.control,
        name: 'config',
        defaultValue: normalizeConnectionConfig(
            connectionType,
            entity?.config ?? {},
            connectionSchemas,
        ),
    });
    const configurationValid = validateConnectionConfigDraft(
        connectionType,
        isRecord(watchedConfig) ? watchedConfig : {},
        connectionSchemas,
    ) === null;
    const configurationError = t`Complete or correct the connection settings before saving.`;
    const managedByCodeFirst = !creating
        && entity?.configurationSource === CONFIGURATION_SOURCE.CODE_FIRST;
    const connectionSubmitHandler = (event: React.FormEvent<HTMLFormElement>) => {
        if (!configurationValid) {
            event.preventDefault();
            event.stopPropagation();
            form.setError('config', {
                type: 'validate',
                message: configurationError,
            });
            return;
        }
        void submitHandler(event);
    };

    return (
        <Page
            pageId="data-hub-connection-detail"
            form={form}
            submitHandler={connectionSubmitHandler}
            entity={entity}
        >
            <PageTitle>
                {creating ? i18n._(DATAHUB_PAGE_LABELS.NEW_CONNECTION) : (entity?.code ?? '')}
            </PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <Button
                        type="submit"
                        disabled={
                            !form.formState.isDirty
                            || !form.formState.isValid
                            || !configurationValid
                            || isPending
                            || managedByCodeFirst
                        }
                    >
                        {creating ? <Trans>Create</Trans> : <Trans>Update</Trans>}
                    </Button>
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="connection-form">
                    {managedByCodeFirst && (
                        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-500/10 p-3">
                            <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
                            <div className="text-sm">
                                <p className="font-medium">
                                    <Trans>Managed by code-first configuration</Trans>
                                </p>
                                <p className="text-muted-foreground">
                                    <Trans>Edit this connection in deployed configuration. Removing the definition releases the persisted connection to Dashboard ownership without deleting it.</Trans>
                                </p>
                            </div>
                        </div>
                    )}
                    <DetailFormGrid>
                        <FormFieldWrapper
                            name="code"
                            label={(
                                <span id={fieldIds.codeLabel}>
                                    <Trans>Code</Trans>
                                </span>
                            )}
                            description={(
                                <span id={fieldIds.codeDescription}>
                                    <Trans>Unique identifier for this connection</Trans>
                                </span>
                            )}
                            control={form.control}
                            rules={{
                                required: t`Code is required`,
                                pattern: {
                                    value: CODE_PATTERN,
                                    message: t`Must start with a letter and contain only letters, numbers, hyphens, and underscores`,
                                },
                            }}
                            render={({ field }) => (
                                <Input
                                    {...field}
                                    aria-labelledby={fieldIds.codeLabel}
                                    aria-describedby={fieldIds.codeDescription}
                                    disabled={managedByCodeFirst}
                                    placeholder="my-connection"
                                />
                            )}
                        />
                        <FormFieldWrapper
                            name="type"
                            label={(
                                <span id={fieldIds.typeLabel}>
                                    <Trans>Connection Type</Trans>
                                </span>
                            )}
                            renderFormControl={false}
                            control={form.control}
                            rules={{
                                required: t`Connection type is required`,
                            }}
                            render={({ field, fieldState }) => {
                                const effectiveType =
                                    (typeof field.value === 'string' && field.value.length > 0)
                                        ? field.value
                                        : String(entity?.type ?? CONNECTION_DEFAULT_TYPE);
                                return (
                                <Select
                                    value={effectiveType}
                                    disabled={managedByCodeFirst}
                                    onValueChange={val => {
                                        const prevType = (field.value as UIConnectionType | undefined) ?? (entity?.type as UIConnectionType | undefined);
                                        const nextType = val as UIConnectionType;
                                        const prevConfig = form.getValues('config') as Record<string, unknown> | undefined;
                                        if (prevType && prevConfig && typeof prevConfig === 'object') {
                                            configCache[prevType] = prevConfig;
                                        }
                                        field.onChange(nextType);
                                        const restored = configCache[nextType]
                                            ?? createDefaultConnectionConfig(nextType, connectionSchemas);
                                        form.setValue('config', restored, {
                                            shouldDirty: true,
                                            shouldValidate: true,
                                        });
                                    }}
                                >
                                    <SelectTrigger
                                        className={SELECT_WIDTHS.CONNECTION_TYPE}
                                        aria-invalid={Boolean(fieldState.error)}
                                        aria-labelledby={fieldIds.typeLabel}
                                    >
                                        <SelectValue
                                            placeholder={t`Select type`}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {connectionTypeOptions.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                );
                            }}
                        />
                    </DetailFormGrid>

                    <div className="mt-6">
                        <h3 className="text-sm font-medium mb-4">
                            <Trans>Connection Settings</Trans>
                        </h3>
                        <FormFieldWrapper
                            name="config"
                            label=""
                            renderFormControl={false}
                            control={form.control}
                            rules={{
                                validate: value => validateConnectionConfigDraft(
                                    (form.getValues('type') || CONNECTION_DEFAULT_TYPE) as UIConnectionType,
                                    isRecord(value) ? value : {},
                                    connectionSchemas,
                                ) === null || t`Complete or correct the connection settings before saving.`,
                            }}
                            render={({ field, fieldState }) => {
                                const serverConfig = normalizeConnectionConfig(
                                    connectionType,
                                    entity?.config ?? {},
                                    connectionSchemas,
                                );
                                const effectiveConfig = isRecord(field.value)
                                    ? (field.value as Record<string, unknown>)
                                    : serverConfig;
                                return (
                                    <div>
                                        <ConnectionConfigEditor
                                            type={connectionType}
                                            config={effectiveConfig}
                                            onChange={field.onChange}
                                            disabled={managedByCodeFirst}
                                        />
                                        <FieldError
                                            error={fieldState.error?.message
                                                ?? (configurationValid
                                                    ? undefined
                                                    : configurationError)}
                                            touched={fieldState.isTouched}
                                            showImmediately={fieldState.isDirty || !configurationValid}
                                        />
                                    </div>
                                );
                            }}
                        />
                    </div>
                </PageBlock>
                {entity && (
                    <PageBlock column="side" blockId="connection-channels">
                        <ManagedResourceChannels
                            channels={entity.channels}
                            entityLabel={entity.code}
                            canUpdate
                            onAssign={channelId => api.mutate(
                                assignConnectionsToChannelDocument,
                                { input: { connectionIds: [String(entity.id)], channelId } },
                            )}
                            onRemove={channelId => api.mutate(
                                removeConnectionsFromChannelDocument,
                                { input: { connectionIds: [String(entity.id)], channelId } },
                            )}
                            onChanged={refreshEntity}
                        />
                    </PageBlock>
                )}
            </PageLayout>
        </Page>
    );
}

function prepareConnectionInput<T extends {
    type?: string | null;
    config?: Record<string, unknown> | null;
}>(input: T, schemas: readonly ConnectionSchema[]): T {
    const type = (input.type || CONNECTION_DEFAULT_TYPE) as UIConnectionType;
    return {
        ...input,
        type,
        config: serializeConnectionConfig(type, input.config, schemas),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
