import * as React from 'react';
import {
    Button,
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
import { AnyRoute, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { AlertCircle, Key, Server } from 'lucide-react';
import { getErrorMessage } from '../../../shared';
import { CODE_PATTERN } from '../../utils';
import { DATAHUB_PERMISSIONS, ROUTES, SECRET_PROVIDER, SELECT_WIDTHS, TOAST_SECRET, ERROR_MESSAGES } from '../../constants';
import { FieldError } from '../../components/common';
import {
    secretDetailDocument,
    createSecretDocument,
    updateSecretDocument,
} from '../../hooks';
import type { DataHubSecret } from '../../types';

type SecretFormInput = Pick<DataHubSecret, 'id' | 'code' | 'provider' | 'value' | 'metadata'> & {
    hasValue: boolean;
};

export const secretDetail: DashboardRouteDefinition = {
    path: `${ROUTES.SECRETS}/$id`,
    loader: detailPageRouteLoader({
        queryDocument: secretDetailDocument,
        breadcrumb: (isNew, entity) => [
            { path: ROUTES.SECRETS, label: 'Secrets' },
            isNew ? 'New Secret' : (entity?.code ?? ''),
        ],
    }),
    component: route => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.READ_SECRET]}>
            <SecretDetailPage route={route} />
        </PermissionGuard>
    ),
};

function SecretDetailPage({ route }: { route: AnyRoute }) {
    const params = route.useParams();
    const navigate = useNavigate();
    const creating = params.id === 'new';

    const { form, submitHandler, entity, isPending, resetForm } = useDetailPage({
        queryDocument: secretDetailDocument,
        createDocument: createSecretDocument,
        updateDocument: updateSecretDocument,
        setValuesForCreate: () => ({
            code: '',
            provider: SECRET_PROVIDER.INLINE,
            value: '',
            metadata: null,
            hasValue: false,
        }),
        setValuesForUpdate: s => ({
            id: s?.id ?? '',
            code: s?.code ?? '',
            provider: s?.provider ?? SECRET_PROVIDER.INLINE,
            value: '',
            metadata: s?.metadata ?? null,
            hasValue: Boolean(s?.value),
        }),
        transformInput: (input: SecretFormInput) => {
            const { hasValue, ...rest } = input;
            const result: Record<string, unknown> = { ...rest };
            if (!rest.value && hasValue && rest.id) {
                delete result.value;
            }
            if (rest.provider === SECRET_PROVIDER.INLINE && rest.value === '') {
                result.value = null;
            }
            return result;
        },
        params: { id: params.id },
        onSuccess: async data => {
            toast.success(TOAST_SECRET.SAVE_SUCCESS);
            resetForm();
            if (creating) {
                await navigate({ to: `../$id`, params: { id: data.id } });
            }
        },
        onError: err => {
            toast.error(TOAST_SECRET.SAVE_ERROR, {
                description: getErrorMessage(err),
            });
        },
    });

    React.useEffect(() => {
        if (!entity) return;
        form.reset(
            {
                id: entity.id ?? '',
                code: entity.code ?? '',
                provider: entity.provider ?? SECRET_PROVIDER.INLINE,
                value: '',
                metadata: entity.metadata ?? null,
                hasValue: Boolean(entity.value),
            },
            { keepDirty: false, keepTouched: false },
        );
    }, [entity?.id, form]);

    const provider = (form.watch('provider') || entity?.provider || SECRET_PROVIDER.INLINE) as 'INLINE' | 'ENV';
    const hasStoredValue = Boolean(form.watch('hasValue') ?? (entity?.value ? true : false));
    const currentValue = form.watch('value');

    return (
        <Page pageId="data-hub-secret-detail" form={form} submitHandler={submitHandler}>
            <PageTitle>{creating ? 'New Secret' : (entity?.code ?? '')}</PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <PermissionGuard requires={creating ? [DATAHUB_PERMISSIONS.CREATE_SECRET] : [DATAHUB_PERMISSIONS.UPDATE_SECRET]}>
                        <Button type="submit" disabled={!form.formState.isDirty || !form.formState.isValid || isPending}>
                            {creating ? 'Create' : 'Update'}
                        </Button>
                    </PermissionGuard>
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="secret-form">
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
                                        placeholder="my-api-key"
                                        className={fieldState.error ? 'border-destructive focus-visible:ring-destructive' : ''}
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
                            render={({ field, fieldState }) => (
                                <div>
                                    <Select
                                        value={(field.value as string) || (entity?.provider ?? SECRET_PROVIDER.INLINE)}
                                        onValueChange={field.onChange}
                                    >
                                        <SelectTrigger className={SELECT_WIDTHS.PROVIDER}>
                                            <SelectValue placeholder="Select provider" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={SECRET_PROVIDER.INLINE}>
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
                            )}
                        />
                    </DetailFormGrid>

                    <FormFieldWrapper
                        name="hasValue"
                        control={form.control}
                        render={({ field }) => <input type="hidden" {...field} />}
                    />

                    <div className="mt-6">
                        <FormFieldWrapper
                            control={form.control}
                            name="value"
                            label={provider === SECRET_PROVIDER.ENV ? 'Environment Variable Name' : 'Secret Value'}
                            rules={{
                                validate: (value: string) => {
                                    if (provider === SECRET_PROVIDER.ENV && (!value || value.trim() === '')) {
                                        return ERROR_MESSAGES.ENV_VAR_NAME_REQUIRED;
                                    }
                                    if (creating && provider === SECRET_PROVIDER.INLINE && (!value || value.trim() === '')) {
                                        return ERROR_MESSAGES.SECRET_VALUE_REQUIRED;
                                    }
                                    if (provider === SECRET_PROVIDER.ENV && value && !/^[A-Z][A-Z0-9_]*$/.test(value)) {
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
                                        placeholder={provider === SECRET_PROVIDER.ENV ? 'MY_API_KEY' : 'Enter secret value'}
                                        className={fieldState.error ? 'border-destructive focus-visible:ring-destructive' : ''}
                                    />
                                    <FieldError error={fieldState.error?.message} touched={fieldState.isTouched} />
                                    {!fieldState.error && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {provider === SECRET_PROVIDER.ENV
                                                ? 'Name of the environment variable to read at runtime'
                                                : 'The actual secret value (stored encrypted)'}
                                        </p>
                                    )}
                                </div>
                            )}
                        />
                    </div>

                    {hasStoredValue && provider !== SECRET_PROVIDER.ENV && !currentValue && (
                        <div className="mt-4 p-3 bg-muted rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <div className="text-sm text-muted-foreground">
                                <p className="font-medium">Existing value retained</p>
                                <p>Enter a new secret to replace the stored value, or leave blank to keep the current one.</p>
                            </div>
                        </div>
                    )}

                    {provider === SECRET_PROVIDER.ENV && (
                        <div className="mt-4 p-3 bg-muted rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <div className="text-sm text-muted-foreground">
                                <p className="font-medium">Environment Variable</p>
                                <p>The value will be read from the server environment at runtime. Make sure the variable is set in your deployment environment.</p>
                            </div>
                        </div>
                    )}
                </PageBlock>
            </PageLayout>
        </Page>
    );
}
