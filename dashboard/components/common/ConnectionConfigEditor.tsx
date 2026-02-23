import * as React from 'react';
import { Button, Input, Switch, Label } from '@vendure/dashboard';
import { PlusCircle, Trash2 } from 'lucide-react';
import { ConnectionAuthType } from '../../../shared/types';
import {
    HTTP_CONNECTION_DEFAULTS,
    PLACEHOLDERS,
    CONNECTION_TYPE,
} from '../../constants';
import { useOptionValues, useConnectionSchemas } from '../../hooks/api/use-config-options';
import type { ConnectionSchemaField } from '../../hooks/api/use-config-options';
import { validateUrl, validatePort, validateHostname } from '../../utils';
import { FieldError } from './ValidationFeedback';
import type { UIConnectionType, HttpConnectionConfig, DataHubSecret } from '../../types';

const DEFAULT_HTTP_CONFIG: HttpConnectionConfig = {
    baseUrl: '',
    timeout: HTTP_CONNECTION_DEFAULTS.TIMEOUT_MS,
    headers: {},
    auth: { type: ConnectionAuthType.NONE },
};

type SecretOption = Pick<DataHubSecret, 'code' | 'provider'>;

export interface ConnectionConfigEditorProps {
    type: UIConnectionType;
    config: Record<string, unknown>;
    onChange: (config: Record<string, unknown>) => void;
    disabled?: boolean;
    secretOptions?: SecretOption[];
}

interface ConfigFieldDef {
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'password' | 'secret';
    placeholder?: string;
    required?: boolean;
    description?: string;
}

/**
 * Fallback connection schemas used when the backend `connectionSchemas` query
 * has not yet loaded or is unavailable.
 */

export function ConnectionConfigEditor({ type, config, onChange, disabled, secretOptions = [] }: ConnectionConfigEditorProps) {
    const resolvedType = (typeof type === 'string' && type.length > 0 ? type : CONNECTION_TYPE.HTTP) as UIConnectionType;
    const { schemas: backendSchemas } = useConnectionSchemas();

    // HTTP-like types use the dedicated HTTP editor with auth/headers support.
    // Determined by backend `httpLike` metadata on the connection schema.
    const isHttpLike = backendSchemas.some(s => s.type === resolvedType && s.httpLike === true);

    if (isHttpLike) {
        return (
            <HttpConnectionFields
                config={config as Record<string, unknown>}
                onChange={onChange}
                disabled={disabled}
                secretOptions={secretOptions}
            />
        );
    }

    const schema = resolveSchema(resolvedType, backendSchemas);
    if (!schema || schema.length === 0) {
        return <div className="text-center py-4 text-muted-foreground">No configuration options available for this type.</div>;
    }

    const updateField = (key: string, value: unknown) => {
        const next = { ...config };
        if (value === undefined || value === '' || value === null) {
            delete next[key];
        } else {
            next[key] = value;
        }
        onChange(next);
    };

    return (
        <div className="space-y-4">
            {schema.map(field => (
                <div key={field.key} className="space-y-1">
                    <div className="flex items-center gap-1">
                        <Label className="text-sm font-medium">
                            {field.label}
                            {field.required && <span className="text-destructive ml-0.5">*</span>}
                        </Label>
                    </div>
                    <ConfigField
                        field={field}
                        value={config[field.key]}
                        onChange={value => updateField(field.key, value)}
                        disabled={disabled}
                        secretOptions={secretOptions}
                    />
                    {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
                </div>
            ))}
        </div>
    );
}

function HttpConnectionFields({
    config,
    onChange,
    disabled,
    secretOptions,
}: {
    config: Record<string, unknown>;
    onChange: (cfg: Record<string, unknown>) => void;
    disabled?: boolean;
    secretOptions?: SecretOption[];
}) {
    const authOptions = useAuthOptions();
    const normalized = React.useMemo(() => normalizeHttpConfig(config), [config]);
    const [urlTouched, setUrlTouched] = React.useState(false);

    const urlError = React.useMemo(() => {
        if (!normalized.baseUrl || normalized.baseUrl.trim() === '') {
            return null;
        }
        const error = validateUrl(normalized.baseUrl, 'Base URL');
        return error?.message ?? null;
    }, [normalized.baseUrl]);

    const updateConfig = (patch: Partial<HttpConnectionConfig>) => {
        onChange({ ...normalized, ...patch });
    };

    // Derive headerRows from props. Use a stable key map to preserve row IDs across renders
    // while still allowing the UI to reflect prop changes.
    const headerRowsKeyRef = React.useRef<Map<string, string>>(new Map());
    const headerRows = React.useMemo(() => {
        const headers = normalized.headers;
        if (!headers) {
            headerRowsKeyRef.current.clear();
            return [];
        }
        const newKeyMap = new Map<string, string>();
        const rows = Object.entries(headers).map(([name, value]) => {
            // Reuse existing ID if we had this header name before, otherwise create new
            const existingId = headerRowsKeyRef.current.get(name);
            const id = existingId ?? createRowId();
            newKeyMap.set(name, id);
            return { id, name, value };
        });
        headerRowsKeyRef.current = newKeyMap;
        return rows;
    }, [normalized.headers]);

    const commitHeaders = (rows: HeaderRow[]) => {
        const cleaned = rows.filter(row => row.name.trim() && row.value.trim());
        const next = cleaned.length ? Object.fromEntries(cleaned.map(row => [row.name.trim(), row.value])) : undefined;
        updateConfig({ headers: next });
    };

    const auth = normalized.auth ?? { type: ConnectionAuthType.NONE };

    const handleAuthTypeChange = (next: ConnectionAuthType) => {
        if (next === ConnectionAuthType.NONE) {
            updateConfig({ auth: { type: ConnectionAuthType.NONE } });
            return;
        }
        updateConfig({ auth: { type: next } });
    };

    const updateAuthField = (key: string, value?: string) => {
        const nextAuth: Record<string, unknown> = { ...(auth ?? { type: ConnectionAuthType.NONE }) };
        if (value === undefined || value === '') {
            delete nextAuth[key];
        } else {
            nextAuth[key] = value;
        }
        updateConfig({ auth: nextAuth as HttpConnectionConfig['auth'] });
    };

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label className="text-sm font-medium">Base URL</Label>
                <Input
                    placeholder={HTTP_CONNECTION_DEFAULTS.BASE_URL_PLACEHOLDER}
                    value={normalized.baseUrl}
                    onChange={e => updateConfig({ baseUrl: e.target.value })}
                    onBlur={() => setUrlTouched(true)}
                    disabled={disabled}
                    className={urlError && urlTouched ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                <FieldError error={urlError} touched={urlTouched} />
                {!urlError && (
                    <p className="text-xs text-muted-foreground">Relative endpoints will be resolved against this URL.</p>
                )}
            </div>

            <div className="space-y-2">
                <Label className="text-sm font-medium">Timeout (ms)</Label>
                <Input
                    type="number"
                    min={0}
                    value={normalized.timeout ?? ''}
                    onChange={e => updateConfig({ timeout: e.target.value ? Number(e.target.value) : undefined })}
                    disabled={disabled}
                />
            </div>

            <div className="space-y-3" role="group" aria-labelledby="default-headers-label">
                <div className="flex items-center justify-between">
                    <div>
                        <Label id="default-headers-label" className="text-sm font-medium">Default Headers</Label>
                        <p className="text-xs text-muted-foreground">Applied to every request.</p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => commitHeaders([...headerRows, createHeaderRow()])}
                        disabled={disabled}
                        aria-label="Add new HTTP header"
                    >
                        <PlusCircle className="w-4 h-4 mr-2" />
                        Add header
                    </Button>
                </div>
                {headerRows.length === 0 && <p className="text-sm text-muted-foreground">No headers configured.</p>}
                {headerRows.map(row => (
                    <div key={row.id} className="grid grid-cols-[1fr,1fr,auto] gap-3">
                        <Input
                            placeholder={PLACEHOLDERS.HEADER_NAME}
                            value={row.name}
                            onChange={e => {
                                const next = headerRows.map(r => (r.id === row.id ? { ...r, name: e.target.value } : r));
                                commitHeaders(next);
                            }}
                            disabled={disabled}
                        />
                        <Input
                            placeholder={PLACEHOLDERS.HEADER_VALUE}
                            value={row.value}
                            onChange={e => {
                                const next = headerRows.map(r => (r.id === row.id ? { ...r, value: e.target.value } : r));
                                commitHeaders(next);
                            }}
                            disabled={disabled}
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => commitHeaders(headerRows.filter(r => r.id !== row.id))}
                            disabled={disabled}
                            aria-label="Remove header"
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                ))}
            </div>

            <div className="space-y-3" role="group" aria-labelledby="authentication-label">
                <Label id="authentication-label" className="text-sm font-medium">Authentication</Label>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Select authentication method">
                    {authOptions.map(option => (
                        <Button
                            key={option.value}
                            type="button"
                            variant={auth.type === option.value ? 'default' : 'outline'}
                            onClick={() => handleAuthTypeChange(option.value)}
                            disabled={disabled}
                            aria-pressed={auth.type === option.value}
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>

                {auth.type === ConnectionAuthType.BEARER && (
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Secret Code</Label>
                        <SecretReferenceInput
                            value={auth.secretCode ?? ''}
                            onChange={value => updateAuthField('secretCode', value)}
                            placeholder={PLACEHOLDERS.BEARER_TOKEN}
                            disabled={disabled}
                            options={secretOptions ?? []}
                        />
                        <p className="text-xs text-muted-foreground">Token will be sent as a Bearer Authorization header.</p>
                    </div>
                )}

                {auth.type === ConnectionAuthType.API_KEY && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Header Name</Label>
                            <Input
                                placeholder={PLACEHOLDERS.API_KEY_HEADER}
                                value={auth.headerName ?? ''}
                                onChange={e => updateAuthField('headerName', e.target.value)}
                                disabled={disabled}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Secret Code</Label>
                            <SecretReferenceInput
                                value={auth.secretCode ?? ''}
                                onChange={value => updateAuthField('secretCode', value)}
                                placeholder={PLACEHOLDERS.API_KEY_SECRET}
                                disabled={disabled}
                                options={secretOptions ?? []}
                            />
                        </div>
                    </div>
                )}

                {auth.type === ConnectionAuthType.BASIC && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Username</Label>
                            <Input
                                placeholder={PLACEHOLDERS.SERVICE_USER}
                                value={auth.username ?? ''}
                                onChange={e => updateAuthField('username', e.target.value)}
                                disabled={disabled}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Password Secret Code</Label>
                            <SecretReferenceInput
                                value={auth.secretCode ?? ''}
                                onChange={value => updateAuthField('secretCode', value)}
                                placeholder={PLACEHOLDERS.PASSWORD_SECRET}
                                disabled={disabled}
                                options={secretOptions ?? []}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

interface HeaderRow {
    id: string;
    name: string;
    value: string;
}

function useAuthOptions(): Array<{ value: ConnectionAuthType; label: string }> {
    const { options: backendOptions } = useOptionValues('authTypes');
    return React.useMemo(() => {
        return backendOptions.map(opt => ({
            value: opt.value as ConnectionAuthType,
            label: opt.label,
        }));
    }, [backendOptions]);
}

function createHeaderRow(): HeaderRow {
    return { id: createRowId(), name: '', value: '' };
}

function createRowId(): string {
    return (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)).slice(0, 8);
}

function normalizeHttpConfig(config: Record<string, unknown>): HttpConnectionConfig {
    const next: HttpConnectionConfig = { ...DEFAULT_HTTP_CONFIG };
    if (typeof config.baseUrl === 'string') {
        next.baseUrl = config.baseUrl;
    }
    if (typeof config.timeout === 'number') {
        next.timeout = config.timeout;
    }
    if (config.headers && typeof config.headers === 'object') {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(config.headers as Record<string, unknown>)) {
            if (typeof value === 'string') {
                headers[key] = value;
            }
        }
        next.headers = headers;
    }
    if (config.auth && typeof config.auth === 'object') {
        const auth = config.auth as Record<string, unknown>;
        const type = (auth.type as ConnectionAuthType) ?? ConnectionAuthType.NONE;
        next.auth = { type };
        if (typeof auth.headerName === 'string') next.auth.headerName = auth.headerName;
        if (typeof auth.secretCode === 'string') next.auth.secretCode = auth.secretCode;
        if (typeof auth.username === 'string') next.auth.username = auth.username;
        if (typeof auth.usernameSecretCode === 'string') next.auth.usernameSecretCode = auth.usernameSecretCode;
    }
    return next;
}

/**
 * Resolves the field schema for a given connection type from backend data.
 */
function resolveSchema(
    type: string,
    backendSchemas: ReadonlyArray<{ type: string; fields: ConnectionSchemaField[] }>,
): ConfigFieldDef[] {
    const backendEntry = backendSchemas.find(s => s.type === type);
    if (!backendEntry || backendEntry.fields.length === 0) return [];
    return backendEntry.fields.map(f => ({
        key: f.key,
        label: f.label,
        type: mapBackendFieldType(f.type),
        placeholder: f.placeholder ?? undefined,
        required: f.required ?? undefined,
        description: f.description ?? undefined,
    }));
}

/** Maps backend field type strings to the ConfigFieldDef type union. */
function mapBackendFieldType(backendType: string): ConfigFieldDef['type'] {
    switch (backendType) {
        case 'text': return 'string';
        case 'number': return 'number';
        case 'password': return 'password';
        case 'boolean': return 'boolean';
        case 'secret': return 'secret';
        default: return 'string';
    }
}

interface ConfigFieldProps {
    field: ConfigFieldDef;
    value: unknown;
    onChange: (value: unknown) => void;
    disabled?: boolean;
    secretOptions?: SecretOption[];
}

function ConfigField({ field, value, onChange, disabled, secretOptions }: ConfigFieldProps) {
    const [touched, setTouched] = React.useState(false);

    const portError = React.useMemo(() => {
        if (field.key === 'port' && value !== undefined && value !== null && value !== '') {
            const error = validatePort(value as string | number, field.label);
            return error?.message ?? null;
        }
        return null;
    }, [field.key, field.label, value]);

    switch (field.type) {
        case 'secret':
            return (
                <SecretReferenceInput
                    value={value != null ? String(value) : ''}
                    onChange={next => onChange(next)}
                    placeholder={field.placeholder}
                    disabled={disabled}
                    options={secretOptions ?? []}
                />
            );
        case 'boolean':
            return (
                <div className="flex items-center gap-2">
                    <Switch checked={Boolean(value)} onCheckedChange={onChange} disabled={disabled} />
                    <span className="text-sm text-muted-foreground">{value ? 'Enabled' : 'Disabled'}</span>
                </div>
            );
        case 'number':
            return (
                <div>
                    <Input
                        type="number"
                        value={value != null ? String(value) : ''}
                        onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)}
                        onBlur={() => setTouched(true)}
                        placeholder={field.placeholder}
                        disabled={disabled}
                        className={portError && touched ? 'border-destructive focus-visible:ring-destructive' : ''}
                    />
                    {field.key === 'port' && <FieldError error={portError} touched={touched} />}
                </div>
            );
        case 'password':
            return (
                <Input
                    type="password"
                    value={String(value ?? '')}
                    onChange={e => onChange(e.target.value || undefined)}
                    placeholder={field.placeholder}
                    disabled={disabled}
                />
            );
        default:
            return (
                <Input
                    type="text"
                    value={String(value ?? '')}
                    onChange={e => onChange(e.target.value || undefined)}
                    placeholder={field.placeholder}
                    disabled={disabled}
                />
            );
    }
}

interface SecretReferenceInputProps {
    value: string;
    onChange: (value?: string) => void;
    placeholder?: string;
    disabled?: boolean;
    options: SecretOption[];
}

function SecretReferenceInput({ value, onChange, placeholder, disabled, options }: SecretReferenceInputProps) {
    const listId = React.useId();
    const handleChange = (next: string) => {
        onChange(next ? next : undefined);
    };
    return (
        <div className="space-y-1">
            <Input
                type="text"
                value={value}
                onChange={e => handleChange(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                list={options.length > 0 ? listId : undefined}
            />
            {options.length > 0 && (
                <>
                    <datalist id={listId}>
                        {options.map(option => (
                            <option key={option.code} value={option.code}>
                                {option.provider ?? 'INLINE'}
                            </option>
                        ))}
                    </datalist>
                    <p className="text-xs text-muted-foreground">
                        Choose an existing secret or type a new reference code.
                    </p>
                </>
            )}
        </div>
    );
}

/**
 * Hook that returns connection type options for dropdowns.
 * Uses backend-provided connection schemas.
 */
export function useConnectionTypeOptions(): ReadonlyArray<{ value: string; label: string }> {
    const { schemas } = useConnectionSchemas();
    return React.useMemo(() => {
        return schemas.map(s => ({ value: s.type, label: s.label }));
    }, [schemas]);
}

export function createDefaultConnectionConfig(type: UIConnectionType): Record<string, unknown> {
    if (type === CONNECTION_TYPE.HTTP) {
        return { ...DEFAULT_HTTP_CONFIG };
    }
    return {};
}

export function normalizeConnectionConfig(
    type: UIConnectionType,
    config: Record<string, unknown> | string | null | undefined,
): Record<string, unknown> {
    if (config == null) {
        return createDefaultConnectionConfig(type);
    }
    let obj: Record<string, unknown> | null = null;
    if (typeof config === 'string') {
        try {
            const parsed = JSON.parse(config);
            if (parsed && typeof parsed === 'object') {
                obj = parsed as Record<string, unknown>;
            }
        } catch {
            obj = null;
        }
    } else {
        obj = config as Record<string, unknown>;
    }
    if (!obj) {
        return createDefaultConnectionConfig(type);
    }
    if (type === CONNECTION_TYPE.HTTP) {
        return { ...normalizeHttpConfig(obj) };
    }
    return obj;
}
