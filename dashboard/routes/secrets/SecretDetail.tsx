import * as React from 'react';
import {
    Button,
    ConfirmationDialog,
    DashboardRouteDefinition,
    DetailFormGrid,
    FormFieldWrapper,
    Input,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    api,
    detailPageRouteLoader,
    useDetailPage,
    usePermissions,
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
    PermissionGuard,
} from '@vendure/dashboard';
import { Trans, useLingui } from '@lingui/react/macro';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { AlertCircle, Key, Server, Trash2, Undo2 } from 'lucide-react';
import { getErrorMessage } from '../../../shared';
import { CODE_PATTERN, getEntityLabel } from '../../utils';
import {
    DATAHUB_NAV_LABELS,
    DATAHUB_PAGE_LABELS,
    DATAHUB_PERMISSIONS,
    DETAIL_ROUTES,
    ROUTES,
    SECRET_PROVIDER,
    SECRET_PROVIDER_TRANSLATION_IDS,
    SELECT_WIDTHS,
} from '../../constants';
import {
    prepareSecretCreateInput,
    prepareSecretUpdateInput,
    getSecretValueValidationIssue,
    SecretFormInputError,
} from './secret-form-input';
import {
    assignSecretsToChannelDocument,
    secretDetailDocument,
    createSecretDocument,
    removeSecretsFromChannelDocument,
    updateSecretDocument,
    useSecretSecurity,
} from '../../hooks';
import { AllPermissionsGuard, ManagedResourceChannels } from '../../components/shared';
import { SecretStatusNotices, SecretValueNotices } from './SecretNotices';

const SECRET_DETAIL_PAGE_ID = 'data-hub-secret-detail';

export const secretDetail: DashboardRouteDefinition = {
    path: DETAIL_ROUTES.SECRET,
    loader: detailPageRouteLoader({
        pageId: SECRET_DETAIL_PAGE_ID,
        queryDocument: secretDetailDocument,
        breadcrumb: (isNew, entity) => [
            { path: ROUTES.SECRETS, label: DATAHUB_NAV_LABELS.SECRETS },
            isNew
                ? DATAHUB_PAGE_LABELS.NEW_SECRET
                : <>{getEntityLabel(entity, 'code')}</>,
        ],
    }),
    component: route => <SecretDetailPermissionGate route={route} />,
};

type DashboardRoute = Parameters<DashboardRouteDefinition['component']>[0];

function SecretDetailPermissionGate({ route }: { route: DashboardRoute }) {
    const params = route.useParams();
    const requiredPermissions = params.id === 'new'
        ? [DATAHUB_PERMISSIONS.CREATE_SECRET, DATAHUB_PERMISSIONS.READ_SECRET]
        : [DATAHUB_PERMISSIONS.READ_SECRET];
    return (
        <AllPermissionsGuard requires={requiredPermissions}>
            <SecretDetailPage route={route} />
        </AllPermissionsGuard>
    );
}

function SecretDetailPage({ route }: { route: DashboardRoute }) {
    const { i18n, t } = useLingui();
    const fieldIdPrefix = React.useId();
    const fieldIds = {
        codeLabel: `${fieldIdPrefix}-code-label`,
        codeDescription: `${fieldIdPrefix}-code-description`,
        providerLabel: `${fieldIdPrefix}-provider-label`,
        providerDescription: `${fieldIdPrefix}-provider-description`,
        valueLabel: `${fieldIdPrefix}-value-label`,
        valueDescription: `${fieldIdPrefix}-value-description`,
    } as const;
    const params = route.useParams();
    const navigate = useNavigate();
    const creating = params.id === 'new';
    const { hasPermissions } = usePermissions();
    const canCreateSecret = hasPermissions([DATAHUB_PERMISSIONS.CREATE_SECRET]);
    const canUpdateSecret = hasPermissions([DATAHUB_PERMISSIONS.UPDATE_SECRET]);
    const canEditSecret = creating ? canCreateSecret : canUpdateSecret;

    const secretSecurityQuery = useSecretSecurity();
    const secretSecurity = secretSecurityQuery.data;
    const { form, submitHandler, entity, isPending, resetForm, refreshEntity } = useDetailPage({
        pageId: SECRET_DETAIL_PAGE_ID,
        queryDocument: secretDetailDocument,
        entityField: 'dataHubSecret',
        createDocument: createSecretDocument,
        updateDocument: updateSecretDocument,
        setValuesForUpdate: (s) => ({
            id: s.id,
            code: s.code,
            provider: s.provider,
            value: '',
            metadata: s?.metadata ?? null,
            clearValue: false,
        }),
        transformCreateInput: prepareSecretCreateInput,
        transformUpdateInput: prepareSecretUpdateInput,
        params: { id: params.id },
        onSuccess: data => {
            toast.success(t`Secret saved successfully`);
            resetForm();
            if (creating && typeof data === 'object' && data !== null && 'id' in data) {
                void navigate({ to: `../$id`, params: { id: data.id } }).catch(error => {
                    toast.error(t`Secret saved, but navigation failed`, {
                        description: getErrorMessage(error),
                    });
                });
            }
        },
        onError: (err) => {
            const description = err instanceof SecretFormInputError
                ? err.code === 'VALUE_REQUIRED'
                    ? t`Secret value is required when creating a new secret`
                    : t`A secret value cannot be replaced and cleared at the same time.`
                : getErrorMessage(err);
            toast.error(t`Failed to save secret`, {
                description,
            });
        },
    });

    React.useEffect(() => {
        if (creating && !form.getValues('provider')) {
            form.setValue('provider', SECRET_PROVIDER.ENV, {
                shouldDirty: false,
                shouldValidate: true,
            });
        }
    }, [creating, form]);

    const provider = (form.watch('provider') || entity?.provider || SECRET_PROVIDER.ENV) as 'INLINE' | 'ENV';
    const existingProvider = (entity?.provider ?? SECRET_PROVIDER.ENV) as 'INLINE' | 'ENV';
    const hasStoredValue = entity?.hasValue === true;
    const currentValue = form.watch('value') ?? '';
    const clearScheduled = form.watch('clearValue') === true;
    const providerChanged = !creating && provider !== existingProvider;
    const hasReplacement = currentValue.trim().length > 0;
    const formDisabled = !canEditSecret || isPending || entity?.isOverridden === true;
    const inlineStorageAvailable = secretSecurity?.inlineStorageAvailable === true;

    const inlineDescription = secretSecurity?.mode === 'ENCRYPTED'
        ? t`The actual secret value (stored encrypted)`
        : secretSecurityQuery.isLoading
            ? t`Checking inline storage availability…`
            : t`Inline storage is unavailable until a master key is configured`;
    return (
        <Page
            pageId={SECRET_DETAIL_PAGE_ID}
            form={form}
            submitHandler={submitHandler}
            entity={entity}
        >
            <PageTitle>
                {creating ? i18n._(DATAHUB_PAGE_LABELS.NEW_SECRET) : (entity?.code ?? '')}
            </PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <PermissionGuard
                        requires={creating ? [DATAHUB_PERMISSIONS.CREATE_SECRET] : [DATAHUB_PERMISSIONS.UPDATE_SECRET]}
                    >
                        <Button
                            type="submit"
                            disabled={
                                !form.formState.isDirty ||
                                !form.formState.isValid ||
                                isPending ||
                                entity?.isOverridden === true
                            }
                        >
                            {creating ? <Trans>Create</Trans> : <Trans>Update</Trans>}
                        </Button>
                    </PermissionGuard>
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="secret-form">
                    <SecretStatusNotices
                        isOverridden={entity?.isOverridden === true}
                        valueStatus={entity?.valueStatus}
                        securityMode={secretSecurity?.mode}
                    />
                    {secretSecurityQuery.isError && (
                        <div
                            className="mb-4 flex flex-col items-start gap-3 rounded-lg bg-destructive/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                            role="alert"
                        >
                            <div className="flex items-start gap-2 text-destructive">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <span><Trans>Inline storage availability could not be verified. Environment variable references remain available.</Trans></span>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void secretSecurityQuery.refetch()}
                                disabled={secretSecurityQuery.isFetching}
                            >
                                <Trans>Retry</Trans>
                            </Button>
                        </div>
                    )}
                    <DetailFormGrid>
                        <FormFieldWrapper
                            control={form.control}
                            name="code"
                            label={(
                                <span id={fieldIds.codeLabel}>
                                    <Trans>Code</Trans>
                                </span>
                            )}
                            description={(
                                <span id={fieldIds.codeDescription}>
                                    <Trans>Unique identifier used to reference this secret</Trans>
                                </span>
                            )}
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
                                    disabled={formDisabled}
                                    placeholder="my-api-key"
                                />
                            )}
                        />
                        <FormFieldWrapper
                            control={form.control}
                            name="provider"
                            label={(
                                <span id={fieldIds.providerLabel}>
                                    <Trans>Provider</Trans>
                                </span>
                            )}
                            description={(
                                <span id={fieldIds.providerDescription}>
                                    <Trans>How the secret value is resolved</Trans>
                                </span>
                            )}
                            renderFormControl={false}
                            rules={{
                                required: t`Provider is required`,
                            }}
                            render={({ field }) => {
                                const effectiveProvider =
                                    (field.value as string) || (entity?.provider ?? SECRET_PROVIDER.ENV);
                                return (
                                    <div>
                                        <Select
                                            disabled={formDisabled}
                                            value={effectiveProvider}
                                            onValueChange={(value) => {
                                                field.onChange(value);
                                                form.setValue('value', '', {
                                                    shouldDirty: true,
                                                    shouldValidate: true,
                                                });
                                                form.setValue('clearValue', false, {
                                                    shouldDirty: true,
                                                    shouldValidate: true,
                                                });
                                                void form.trigger('value');
                                            }}
                                        >
                                            <SelectTrigger
                                                className={SELECT_WIDTHS.PROVIDER}
                                                aria-labelledby={fieldIds.providerLabel}
                                                aria-describedby={fieldIds.providerDescription}
                                            >
                                                <SelectValue
                                                    placeholder={t`Select provider`}
                                                />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem
                                                    value={SECRET_PROVIDER.INLINE}
                                                    disabled={!inlineStorageAvailable}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Key className="h-4 w-4" aria-hidden="true" />
                                                        {i18n._(SECRET_PROVIDER_TRANSLATION_IDS.INLINE)}
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value={SECRET_PROVIDER.ENV}>
                                                    <div className="flex items-center gap-2">
                                                        <Server className="h-4 w-4" aria-hidden="true" />
                                                        {i18n._(SECRET_PROVIDER_TRANSLATION_IDS.ENV)}
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                );
                            }}
                        />
                    </DetailFormGrid>

                    <div className="mt-6">
                        <FormFieldWrapper
                            control={form.control}
                            name="value"
                            label={(
                                <span id={fieldIds.valueLabel}>
                                    {provider === SECRET_PROVIDER.ENV
                                        ? <Trans>Environment variable name</Trans>
                                        : <Trans>Secret value</Trans>}
                                </span>
                            )}
                            description={(
                                <span id={fieldIds.valueDescription}>
                                    {provider === SECRET_PROVIDER.ENV
                                        ? <Trans>Name of the environment variable to read at runtime</Trans>
                                        : inlineDescription}
                                </span>
                            )}
                            rules={{
                                validate: (value: string | undefined) => {
                                    const selectedProvider = (form.getValues('provider') || existingProvider) as
                                        | 'INLINE'
                                        | 'ENV';
                                    const issue = getSecretValueValidationIssue({
                                        value,
                                        provider: selectedProvider,
                                        existingProvider,
                                        creating,
                                        clearValue: form.getValues('clearValue') === true,
                                    });
                                    if (issue === 'ENV_NAME_REQUIRED') {
                                        return t`Environment variable name is required`;
                                    }
                                    if (issue === 'INLINE_VALUE_REQUIRED') {
                                        return t`Secret value is required when creating a secret or changing provider`;
                                    }
                                    if (issue === 'INVALID_ENV_NAME') {
                                        return t`Environment variable names should be uppercase with underscores and no spaces (e.g., MY_API_KEY)`;
                                    }
                                    return true;
                                },
                            }}
                            render={({ field }) => (
                                <Input
                                    type={provider === SECRET_PROVIDER.ENV ? 'text' : 'password'}
                                    {...field}
                                    aria-labelledby={fieldIds.valueLabel}
                                    aria-describedby={fieldIds.valueDescription}
                                    value={field.value || ''}
                                    disabled={
                                        clearScheduled
                                        || formDisabled
                                        || (provider === SECRET_PROVIDER.INLINE && !inlineStorageAvailable)
                                    }
                                    autoComplete={provider === SECRET_PROVIDER.ENV ? 'off' : 'new-password'}
                                    autoCapitalize={provider === SECRET_PROVIDER.ENV ? 'characters' : 'none'}
                                    spellCheck={false}
                                    placeholder={
                                        provider === SECRET_PROVIDER.ENV
                                            ? 'MY_API_KEY'
                                            : t`Enter secret value`
                                    }
                                    onChange={(event) => {
                                        if (form.getValues('clearValue') === true) {
                                            form.setValue('clearValue', false, {
                                                shouldDirty: true,
                                            });
                                        }
                                        field.onChange(event);
                                    }}
                                />
                            )}
                        />
                    </div>

                    {!creating && hasStoredValue && !entity?.isOverridden && (
                        <div className="mt-4">
                            <PermissionGuard requires={[DATAHUB_PERMISSIONS.UPDATE_SECRET]}>
                                {clearScheduled ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            form.setValue('clearValue', false, {
                                                shouldDirty: true,
                                                shouldValidate: true,
                                            });
                                            void form.trigger('value');
                                        }}
                                    >
                                        <Undo2 className="h-4 w-4" aria-hidden="true" />
                                        <Trans>Undo clear</Trans>
                                    </Button>
                                ) : (
                                    <ConfirmationDialog
                                        title={t`Clear stored secret value?`}
                                        description={t`The stored value or environment variable reference will be removed when you save this secret. This cannot be recovered from the Data Hub.`}
                                        confirmText={t`Clear value`}
                                        onConfirm={() => {
                                            form.setValue('value', '', {
                                                shouldDirty: true,
                                                shouldValidate: true,
                                            });
                                            form.setValue('clearValue', true, {
                                                shouldDirty: true,
                                                shouldValidate: true,
                                            });
                                            void form.trigger('value');
                                        }}
                                    >
                                        <Button type="button" variant="outline">
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                            <Trans>Clear stored value</Trans>
                                        </Button>
                                    </ConfirmationDialog>
                                )}
                            </PermissionGuard>
                        </div>
                    )}

                    <div className="mt-4">
                        <SecretValueNotices
                            provider={provider}
                            hasStoredValue={hasStoredValue}
                            hasReplacement={hasReplacement}
                            clearScheduled={clearScheduled}
                            providerChanged={providerChanged}
                        />
                    </div>
                </PageBlock>
                {entity && (
                    <PageBlock column="side" blockId="secret-channels">
                        <ManagedResourceChannels
                            channels={entity.channels}
                            entityLabel={entity.code}
                            canUpdate={canUpdateSecret}
                            onAssign={channelId => api.mutate(
                                assignSecretsToChannelDocument,
                                { input: { secretIds: [String(entity.id)], channelId } },
                            )}
                            onRemove={channelId => api.mutate(
                                removeSecretsFromChannelDocument,
                                { input: { secretIds: [String(entity.id)], channelId } },
                            )}
                            onChanged={refreshEntity}
                        />
                    </PageBlock>
                )}
            </PageLayout>
        </Page>
    );
}
