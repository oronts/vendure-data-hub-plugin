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
import { graphql } from '@/gql';
import { AnyRoute, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { AlertCircle, Key, Server } from 'lucide-react';
import { CODE_PATTERN } from '../../utils/form-validation';
import { FieldError } from '../../components/common/validation-feedback';

const detailDocument = graphql(`
    query DataHubSecretDetail($id: ID!) {
        dataHubSecret(id: $id) {
            id
            code
            provider
            value
            metadata
        }
    }
`);

const createDocument = graphql(`
    mutation CreateDataHubSecret($input: CreateDataHubSecretInput!) {
        createDataHubSecret(input: $input) { id }
    }
`);

const updateDocument = graphql(`
    mutation UpdateDataHubSecret($input: UpdateDataHubSecretInput!) {
        updateDataHubSecret(input: $input) { id }
    }
`);

export const secretDetail: DashboardRouteDefinition = {
    path: '/data-hub/secrets/$id',
    loader: detailPageRouteLoader({
        queryDocument: detailDocument,
        breadcrumb: (isNew, entity) => [
            { path: '/data-hub/secrets', label: 'Secrets' },
            isNew ? 'New Secret' : (entity?.code ?? ''),
        ],
    }),
    component: route => (
        <PermissionGuard requires={['ReadDataHubSecret']}>
            <SecretDetailPage route={route} />
        </PermissionGuard>
    ),
};

function SecretDetailPage({ route }: { route: AnyRoute }) {
    const params = route.useParams();
    const navigate = useNavigate();
    const creating = params.id === 'new';

    const { form, submitHandler, entity, isPending, resetForm } = useDetailPage({
        queryDocument: detailDocument,
        createDocument,
        updateDocument,
        setValuesForCreate: () => ({
            code: '',
            provider: 'inline',
            value: '',
            metadata: null,
            hasValue: false,
        }),
        setValuesForUpdate: s => ({
            id: s?.id ?? '',
            code: s?.code ?? '',
            provider: s?.provider ?? 'inline',
            value: '',
            metadata: s?.metadata ?? null,
            hasValue: Boolean(s?.value),
        }),
        transformInput: input => {
            const { hasValue, ...rest } = input as any;
            if (!rest.value && hasValue && rest.id) {
                delete rest.value;
            }
            if (rest.provider === 'inline' && rest.value === '') {
                rest.value = null;
            }
            return rest;
        },
        params: { id: params.id },
        onSuccess: async data => {
            toast('Secret saved successfully');
            resetForm();
            if (creating) {
                await navigate({ to: `../$id`, params: { id: data.id } });
            }
        },
        onError: err => {
            toast('Failed to save secret', {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        },
    });

    // Ensure form shows server values immediately after load
    React.useEffect(() => {
        if (!entity) return;
        form.reset(
            {
                id: entity.id ?? '',
                code: entity.code ?? '',
                provider: entity.provider ?? 'inline',
                value: '', // never hydrate masked values
                metadata: entity.metadata ?? null,
                hasValue: Boolean(entity.value),
            },
            { keepDirty: false, keepTouched: false },
        );
    }, [entity?.id]);

    const provider = (form.watch('provider') || entity?.provider || 'inline') as 'inline' | 'env';
    const hasStoredValue = Boolean(form.watch('hasValue') ?? (entity?.value ? true : false));
    const currentValue = form.watch('value');

    return (
        <Page pageId="data-hub-secret-detail" form={form} submitHandler={submitHandler}>
            <PageTitle>{creating ? 'New Secret' : (entity?.code ?? '')}</PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <PermissionGuard requires={creating ? ['CreateDataHubSecret'] : ['UpdateDataHubSecret']}>
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
                            rules={{ required: 'Provider is required' }}
                            render={({ field, fieldState }) => (
                                <div>
                                    <Select
                                        value={(field.value as string) || (entity?.provider ?? 'inline')}
                                        onValueChange={field.onChange}
                                    >
                                        <SelectTrigger className="w-[220px]">
                                            <SelectValue placeholder="Select provider" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="inline">
                                                <div className="flex items-center gap-2">
                                                    <Key className="w-4 h-4" />
                                                    Inline Value
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="env">
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
                            label={provider === 'env' ? 'Environment Variable Name' : 'Secret Value'}
                            rules={{
                                validate: (value: string) => {
                                    // For env provider, value is always required
                                    if (provider === 'env' && (!value || value.trim() === '')) {
                                        return 'Environment variable name is required';
                                    }
                                    // For inline provider when creating, value is required
                                    if (creating && provider === 'inline' && (!value || value.trim() === '')) {
                                        return 'Secret value is required when creating a new secret';
                                    }
                                    // For env variables, validate the format (uppercase letters, numbers, underscores)
                                    if (provider === 'env' && value && !/^[A-Z][A-Z0-9_]*$/.test(value)) {
                                        return 'Environment variable names should be uppercase with underscores (e.g., MY_API_KEY)';
                                    }
                                    return true;
                                },
                            }}
                            render={({ field, fieldState }) => (
                                <div>
                                    <Input
                                        type={provider === 'env' ? 'text' : 'password'}
                                        {...field}
                                        value={field.value || ''}
                                        placeholder={provider === 'env' ? 'MY_API_KEY' : 'Enter secret value'}
                                        className={fieldState.error ? 'border-destructive focus-visible:ring-destructive' : ''}
                                    />
                                    <FieldError error={fieldState.error?.message} touched={fieldState.isTouched} />
                                    {!fieldState.error && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {provider === 'env'
                                                ? 'Name of the environment variable to read at runtime'
                                                : 'The actual secret value (stored encrypted)'}
                                        </p>
                                    )}
                                </div>
                            )}
                        />
                    </div>

                    {hasStoredValue && provider !== 'env' && !currentValue && (
                        <div className="mt-4 p-3 bg-muted rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <div className="text-sm text-muted-foreground">
                                <p className="font-medium">Existing value retained</p>
                                <p>Enter a new secret to replace the stored value, or leave blank to keep the current one.</p>
                            </div>
                        </div>
                    )}

                    {provider === 'env' && (
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
