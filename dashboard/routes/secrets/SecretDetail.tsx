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
import { useLingui } from '@lingui/react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { AlertCircle, Key, Server, Trash2, Undo2 } from 'lucide-react';
import { ENV_VARIABLE_NAME_PATTERN, getErrorMessage } from '../../../shared';
import { CODE_PATTERN, getEntityLabel } from '../../utils';
import {
    DATAHUB_NAV_LABELS,
    DATAHUB_FIELD_TRANSLATION_IDS,
    DATAHUB_PAGE_LABELS,
    DATAHUB_PERMISSIONS,
    DETAIL_ROUTES,
    ROUTES,
    SECRET_PROVIDER,
    SECRET_PROVIDER_TRANSLATION_IDS,
    SECRET_DETAIL_TRANSLATION_IDS,
    SELECT_WIDTHS,
} from '../../constants';
import {
    prepareSecretCreateInput,
    prepareSecretUpdateInput,
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
    const { i18n } = useLingui();
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
    const canUpdateChannels = hasPermissions([DATAHUB_PERMISSIONS.UPDATE_SECRET]);

    const { data: secretSecurity } = useSecretSecurity();
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
        onSuccess: async (data) => {
            toast.success(i18n._(SECRET_DETAIL_TRANSLATION_IDS.SAVE_SUCCESS));
            resetForm();
            if (creating && typeof data === 'object' && data !== null && 'id' in data) {
                await navigate({ to: `../$id`, params: { id: data.id } });
            }
        },
        onError: (err) => {
            const description = err instanceof SecretFormInputError
                ? i18n._(
                    err.code === 'VALUE_REQUIRED'
                        ? SECRET_DETAIL_TRANSLATION_IDS.SECRET_VALUE_REQUIRED
                        : SECRET_DETAIL_TRANSLATION_IDS.CONFLICTING_VALUE_ACTIONS,
                )
                : getErrorMessage(err);
            toast.error(i18n._(SECRET_DETAIL_TRANSLATION_IDS.SAVE_ERROR), {
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

    const inlineDescription = secretSecurity?.mode === 'ENCRYPTED'
        ? i18n._(SECRET_DETAIL_TRANSLATION_IDS.INLINE_ENCRYPTED_HELP)
        : i18n._(SECRET_DETAIL_TRANSLATION_IDS.INLINE_UNAVAILABLE_HELP);
    return (
        <Page pageId={SECRET_DETAIL_PAGE_ID} form={form} submitHandler={submitHandler}>
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
                            {i18n._(creating
                                ? SECRET_DETAIL_TRANSLATION_IDS.CREATE
                                : SECRET_DETAIL_TRANSLATION_IDS.UPDATE)}
                        </Button>
                    </PermissionGuard>
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="secret-form">
                    {entity?.isOverridden && (
                        <div className="mb-4 p-3 bg-amber-500/10 rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-medium">
                                    {i18n._(SECRET_DETAIL_TRANSLATION_IDS.OVERRIDDEN_TITLE)}
                                </p>
                                <p className="text-muted-foreground">
                                    {i18n._(SECRET_DETAIL_TRANSLATION_IDS.OVERRIDDEN_DESCRIPTION)}
                                </p>
                            </div>
                        </div>
                    )}
                    {entity?.valueStatus === 'UNENCRYPTED' && (
                        <div className="mb-4 p-3 bg-destructive/10 rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
                            <div className="text-sm">
                                <p className="font-medium text-destructive">
                                    {i18n._(SECRET_DETAIL_TRANSLATION_IDS.UNENCRYPTED_TITLE)}
                                </p>
                                <p className="text-muted-foreground">
                                    {i18n._(SECRET_DETAIL_TRANSLATION_IDS.UNENCRYPTED_DESCRIPTION)}
                                </p>
                            </div>
                        </div>
                    )}
                    {secretSecurity?.mode === 'STRICT_DISABLED' && (
                        <div className="mb-4 p-3 bg-muted rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <p className="text-sm text-muted-foreground">
                                {i18n._(SECRET_DETAIL_TRANSLATION_IDS.INLINE_DISABLED_DESCRIPTION)}
                            </p>
                        </div>
                    )}
                    <DetailFormGrid>
                        <FormFieldWrapper
                            control={form.control}
                            name="code"
                            label={(
                                <span id={fieldIds.codeLabel}>
                                    {i18n._(DATAHUB_FIELD_TRANSLATION_IDS.CODE)}
                                </span>
                            )}
                            description={(
                                <span id={fieldIds.codeDescription}>
                                    {i18n._(SECRET_DETAIL_TRANSLATION_IDS.CODE_HELP)}
                                </span>
                            )}
                            rules={{
                                required: i18n._(SECRET_DETAIL_TRANSLATION_IDS.CODE_REQUIRED),
                                pattern: {
                                    value: CODE_PATTERN,
                                    message: i18n._(SECRET_DETAIL_TRANSLATION_IDS.CODE_PATTERN),
                                },
                            }}
                            render={({ field }) => (
                                <Input
                                    {...field}
                                    aria-labelledby={fieldIds.codeLabel}
                                    aria-describedby={fieldIds.codeDescription}
                                    disabled={entity?.isOverridden === true}
                                    placeholder="my-api-key"
                                />
                            )}
                        />
                        <FormFieldWrapper
                            control={form.control}
                            name="provider"
                            label={(
                                <span id={fieldIds.providerLabel}>
                                    {i18n._(DATAHUB_FIELD_TRANSLATION_IDS.PROVIDER)}
                                </span>
                            )}
                            description={(
                                <span id={fieldIds.providerDescription}>
                                    {i18n._(SECRET_DETAIL_TRANSLATION_IDS.PROVIDER_HELP)}
                                </span>
                            )}
                            renderFormControl={false}
                            rules={{
                                required: i18n._(SECRET_DETAIL_TRANSLATION_IDS.PROVIDER_REQUIRED),
                            }}
                            render={({ field }) => {
                                const effectiveProvider =
                                    (field.value as string) || (entity?.provider ?? SECRET_PROVIDER.ENV);
                                return (
                                    <div>
                                        <Select
                                            disabled={entity?.isOverridden === true}
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
                                                    placeholder={i18n._(
                                                        SECRET_DETAIL_TRANSLATION_IDS.SELECT_PROVIDER,
                                                    )}
                                                />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem
                                                    value={SECRET_PROVIDER.INLINE}
                                                    disabled={secretSecurity?.inlineStorageAvailable === false}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Key className="w-4 h-4" />
                                                        {i18n._(SECRET_PROVIDER_TRANSLATION_IDS.INLINE)}
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value={SECRET_PROVIDER.ENV}>
                                                    <div className="flex items-center gap-2">
                                                        <Server className="w-4 h-4" />
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
                                    {i18n._(provider === SECRET_PROVIDER.ENV
                                        ? SECRET_DETAIL_TRANSLATION_IDS.ENVIRONMENT_NAME
                                        : SECRET_DETAIL_TRANSLATION_IDS.SECRET_VALUE)}
                                </span>
                            )}
                            description={(
                                <span id={fieldIds.valueDescription}>
                                    {provider === SECRET_PROVIDER.ENV
                                        ? i18n._(SECRET_DETAIL_TRANSLATION_IDS.ENVIRONMENT_NAME_HELP)
                                        : inlineDescription}
                                </span>
                            )}
                            rules={{
                                validate: (value: string | undefined) => {
                                    const selectedProvider = (form.getValues('provider') || existingProvider) as
                                        | 'INLINE'
                                        | 'ENV';
                                    const normalizedValue = value?.trim() ?? '';
                                    const replacementProvided = normalizedValue.length > 0;
                                    const providerWillChange = !creating && selectedProvider !== existingProvider;

                                    if (form.getValues('clearValue') === true && !providerWillChange) {
                                        return true;
                                    }
                                    if ((creating || providerWillChange) && !replacementProvided) {
                                        return selectedProvider === SECRET_PROVIDER.ENV
                                            ? i18n._(SECRET_DETAIL_TRANSLATION_IDS.ENVIRONMENT_NAME_REQUIRED)
                                            : i18n._(SECRET_DETAIL_TRANSLATION_IDS.SECRET_VALUE_REQUIRED);
                                    }
                                    if (
                                        selectedProvider === SECRET_PROVIDER.ENV &&
                                        replacementProvided &&
                                        !ENV_VARIABLE_NAME_PATTERN.test(normalizedValue)
                                    ) {
                                        return i18n._(SECRET_DETAIL_TRANSLATION_IDS.ENVIRONMENT_NAME_FORMAT);
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
                                    disabled={clearScheduled || entity?.isOverridden === true}
                                    placeholder={
                                        provider === SECRET_PROVIDER.ENV
                                            ? 'MY_API_KEY'
                                            : i18n._(SECRET_DETAIL_TRANSLATION_IDS.ENTER_SECRET_VALUE)
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
                                        <Undo2 className="w-4 h-4" />
                                        {i18n._(SECRET_DETAIL_TRANSLATION_IDS.UNDO_CLEAR)}
                                    </Button>
                                ) : (
                                    <ConfirmationDialog
                                        title={i18n._(SECRET_DETAIL_TRANSLATION_IDS.CLEAR_DIALOG_TITLE)}
                                        description={i18n._(
                                            SECRET_DETAIL_TRANSLATION_IDS.CLEAR_DIALOG_DESCRIPTION,
                                        )}
                                        confirmText={i18n._(SECRET_DETAIL_TRANSLATION_IDS.CLEAR_VALUE)}
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
                                            <Trash2 className="w-4 h-4" />
                                            {i18n._(SECRET_DETAIL_TRANSLATION_IDS.CLEAR_STORED_VALUE)}
                                        </Button>
                                    </ConfirmationDialog>
                                )}
                            </PermissionGuard>
                        </div>
                    )}

                    {clearScheduled && (
                        <div className="mt-4 p-3 bg-destructive/10 rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
                            <div className="text-sm">
                                <p className="font-medium text-destructive">
                                    {i18n._(SECRET_DETAIL_TRANSLATION_IDS.CLEAR_SCHEDULED_TITLE)}
                                </p>
                                <p className="text-muted-foreground">
                                    {i18n._(SECRET_DETAIL_TRANSLATION_IDS.CLEAR_SCHEDULED_DESCRIPTION)}
                                </p>
                            </div>
                        </div>
                    )}

                    {hasStoredValue && !hasReplacement && !clearScheduled && !providerChanged && (
                        <div className="mt-4 p-3 bg-muted rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <div className="text-sm text-muted-foreground">
                                <p className="font-medium">
                                    {i18n._(SECRET_DETAIL_TRANSLATION_IDS.RETAINED_TITLE)}
                                </p>
                                <p>
                                    {i18n._(SECRET_DETAIL_TRANSLATION_IDS.RETAINED_DESCRIPTION)}
                                </p>
                            </div>
                        </div>
                    )}

                    {provider === SECRET_PROVIDER.ENV && (
                        <div className="mt-4 p-3 bg-muted rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <div className="text-sm text-muted-foreground">
                                <p className="font-medium">
                                    {i18n._(SECRET_PROVIDER_TRANSLATION_IDS.ENV)}
                                </p>
                                <p>
                                    {i18n._(SECRET_DETAIL_TRANSLATION_IDS.ENVIRONMENT_DESCRIPTION)}
                                </p>
                            </div>
                        </div>
                    )}
                </PageBlock>
                {entity && (
                    <PageBlock column="side" blockId="secret-channels">
                        <ManagedResourceChannels
                            channels={entity.channels}
                            entityLabel={entity.code}
                            canUpdate={canUpdateChannels}
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
