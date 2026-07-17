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
    detailPageRouteLoader,
    useDetailPage,
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
    PermissionGuard,
} from '@vendure/dashboard';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { AlertCircle, Key, Server, Trash2, Undo2 } from 'lucide-react';
import { ENV_VARIABLE_NAME_PATTERN, getErrorMessage } from '../../../shared';
import { CODE_PATTERN, getEntityLabel } from '../../utils';
import {
    DATAHUB_PERMISSIONS,
    ROUTES,
    SECRET_PROVIDER,
    SELECT_WIDTHS,
    TOAST_SECRET,
    ERROR_MESSAGES,
} from '../../constants';
import { FieldError } from '../../components/common';
import { prepareSecretCreateInput, prepareSecretUpdateInput } from './secret-form-input';
import {
    secretDetailDocument,
    createSecretDocument,
    updateSecretDocument,
    useSecretSecurity,
} from '../../hooks';
import { AllPermissionsGuard } from '../../components/shared';

const SECRET_DETAIL_PAGE_ID = 'data-hub-secret-detail';

export const secretDetail: DashboardRouteDefinition = {
    path: `${ROUTES.SECRETS}/$id`,
    loader: detailPageRouteLoader({
        pageId: SECRET_DETAIL_PAGE_ID,
        queryDocument: secretDetailDocument,
        breadcrumb: (isNew, entity) => [
            { path: ROUTES.SECRETS, label: 'Secrets' },
            isNew
                ? 'New Secret'
                : getEntityLabel(entity, 'code'),
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
    const params = route.useParams();
    const navigate = useNavigate();
    const creating = params.id === 'new';

    const { data: secretSecurity } = useSecretSecurity();
    const { form, submitHandler, entity, isPending, resetForm } = useDetailPage({
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
            toast.success(TOAST_SECRET.SAVE_SUCCESS);
            resetForm();
            if (creating && typeof data === 'object' && data !== null && 'id' in data) {
                await navigate({ to: `../$id`, params: { id: data.id } });
            }
        },
        onError: (err) => {
            toast.error(TOAST_SECRET.SAVE_ERROR, {
                description: getErrorMessage(err),
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
        ? 'The actual secret value (stored encrypted)'
        : 'Inline storage is unavailable until a master key is configured';
    return (
        <Page pageId={SECRET_DETAIL_PAGE_ID} form={form} submitHandler={submitHandler}>
            <PageTitle>{creating ? 'New Secret' : (entity?.code ?? '')}</PageTitle>
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
                            {creating ? 'Create' : 'Update'}
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
                                <p className="font-medium">Overridden by code-first configuration</p>
                                <p className="text-muted-foreground">
                                    Runtime resolution uses the in-memory definition with this code. This database row
                                    cannot be updated; delete it before removing the code-first definition to prevent a
                                    unencrypted credential from becoming active.
                                </p>
                            </div>
                        </div>
                    )}
                    {entity?.valueStatus === 'UNENCRYPTED' && (
                        <div className="mb-4 p-3 bg-destructive/10 rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
                            <div className="text-sm">
                                <p className="font-medium text-destructive">Unencrypted inline value</p>
                                <p className="text-muted-foreground">
                                    Strict runtime resolution rejects this value. Enter a replacement while the correct
                                    master key is configured to store it encrypted.
                                </p>
                            </div>
                        </div>
                    )}
                    {secretSecurity?.mode === 'STRICT_DISABLED' && (
                        <div className="mb-4 p-3 bg-muted rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <p className="text-sm text-muted-foreground">
                                Inline storage is disabled until DATAHUB_MASTER_KEY is configured. Use an environment
                                variable reference.
                            </p>
                        </div>
                    )}
                    <DetailFormGrid>
                        <FormFieldWrapper
                            control={form.control}
                            name="code"
                            label="Code"
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
                                        disabled={entity?.isOverridden === true}
                                        placeholder="my-api-key"
                                        className={
                                            fieldState.error ? 'border-destructive focus-visible:ring-destructive' : ''
                                        }
                                    />
                                    <FieldError error={fieldState.error?.message} touched={fieldState.isTouched} />
                                    {!fieldState.error && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Unique identifier used to reference this secret
                                        </p>
                                    )}
                                </div>
                            )}
                        />
                        <FormFieldWrapper
                            control={form.control}
                            name="provider"
                            label="Provider"
                            rules={{ required: ERROR_MESSAGES.PROVIDER_REQUIRED }}
                            render={({ field, fieldState }) => {
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
                                            <SelectTrigger className={SELECT_WIDTHS.PROVIDER}>
                                                <SelectValue placeholder="Select provider" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem
                                                    value={SECRET_PROVIDER.INLINE}
                                                    disabled={secretSecurity?.inlineStorageAvailable === false}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Key className="w-4 h-4" />
                                                        Inline Value
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value={SECRET_PROVIDER.ENV}>
                                                    <div className="flex items-center gap-2">
                                                        <Server className="w-4 h-4" />
                                                        Environment Variable
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FieldError error={fieldState.error?.message} touched={fieldState.isTouched} />
                                        {!fieldState.error && (
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                How the secret value is resolved
                                            </p>
                                        )}
                                    </div>
                                );
                            }}
                        />
                    </DetailFormGrid>

                    <div className="mt-6">
                        <FormFieldWrapper
                            control={form.control}
                            name="value"
                            label={provider === SECRET_PROVIDER.ENV ? 'Environment Variable Name' : 'Secret Value'}
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
                                            ? ERROR_MESSAGES.ENV_VAR_NAME_REQUIRED
                                            : ERROR_MESSAGES.SECRET_VALUE_REQUIRED;
                                    }
                                    if (
                                        selectedProvider === SECRET_PROVIDER.ENV &&
                                        replacementProvided &&
                                        !ENV_VARIABLE_NAME_PATTERN.test(normalizedValue)
                                    ) {
                                        return ERROR_MESSAGES.ENV_VAR_FORMAT;
                                    }
                                    return true;
                                },
                            }}
                            render={({ field, fieldState }) => (
                                <div>
                                    <Input
                                        type={provider === SECRET_PROVIDER.ENV ? 'text' : 'password'}
                                        {...field}
                                        value={field.value || ''}
                                        disabled={clearScheduled || entity?.isOverridden === true}
                                        placeholder={
                                            provider === SECRET_PROVIDER.ENV ? 'MY_API_KEY' : 'Enter secret value'
                                        }
                                        className={
                                            fieldState.error ? 'border-destructive focus-visible:ring-destructive' : ''
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
                                    <FieldError error={fieldState.error?.message} touched={fieldState.isTouched} />
                                    {!fieldState.error && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {provider === SECRET_PROVIDER.ENV
                                                ? 'Name of the environment variable to read at runtime'
                                                : inlineDescription}
                                        </p>
                                    )}
                                </div>
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
                                        Undo clear
                                    </Button>
                                ) : (
                                    <ConfirmationDialog
                                        title="Clear stored secret value?"
                                        description="The stored value or environment variable reference will be removed when you save this secret. This cannot be recovered from the Data Hub."
                                        confirmText="Clear value"
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
                                            Clear stored value
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
                                <p className="font-medium text-destructive">Stored value will be cleared</p>
                                <p className="text-muted-foreground">
                                    Select Undo clear to retain it, or update the secret to apply the removal.
                                </p>
                            </div>
                        </div>
                    )}

                    {hasStoredValue && !hasReplacement && !clearScheduled && !providerChanged && (
                        <div className="mt-4 p-3 bg-muted rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <div className="text-sm text-muted-foreground">
                                <p className="font-medium">Existing value retained</p>
                                <p>
                                    Enter a replacement to change it, or leave this field blank to keep the current
                                    value.
                                </p>
                            </div>
                        </div>
                    )}

                    {provider === SECRET_PROVIDER.ENV && (
                        <div className="mt-4 p-3 bg-muted rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <div className="text-sm text-muted-foreground">
                                <p className="font-medium">Environment Variable</p>
                                <p>
                                    The value will be read from the server environment at runtime. Make sure the
                                    variable is set in your deployment environment.
                                </p>
                            </div>
                        </div>
                    )}
                </PageBlock>
            </PageLayout>
        </Page>
    );
}
