import { useCallback, useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Input,
    Label,
} from '@vendure/dashboard';
import { Plus, X } from 'lucide-react';
import { getHttpHeaderNameError } from '../../../shared/utils/http-policy';
import {
    hasHttpHeaderName,
    renameHttpHeader,
} from '../../utils/http-header-rows';

interface HeadersEditorProps {
    headers: Record<string, string>;
    onChange: (headers: Record<string, string>) => void;
    label?: string;
    description?: string;
    emptyMessage?: string;
    placeholder?: string;
    disabled?: boolean;
}

export function HeadersEditor({
    headers,
    onChange,
    label,
    description,
    emptyMessage,
    placeholder,
    disabled,
}: HeadersEditorProps) {
    const { t } = useLingui();
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [newKeyError, setNewKeyError] = useState<string | null>(null);
    const labelId = useId();
    const descriptionId = useId();
    const newKeyErrorId = useId();
    const entries = Object.entries(headers);
    const resolvedLabel = label ?? t`Custom Headers`;
    const resolvedPlaceholder = placeholder
        ?? t`Header value`;

    const addHeader = useCallback(() => {
        const key = newKey.trim();
        const error = getHeaderNameError(key, headers, undefined, t);
        if (error) {
            setNewKeyError(error);
            return;
        }
        onChange({ ...headers, [key]: newValue });
        setNewKey('');
        setNewValue('');
        setNewKeyError(null);
    }, [newKey, newValue, headers, onChange, t]);

    const handleAddKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        addHeader();
    }, [addHeader]);

    const removeHeader = useCallback((key: string) => {
        const next = { ...headers };
        delete next[key];
        onChange(next);
    }, [headers, onChange]);

    const updateHeaderValue = useCallback((key: string, value: string) => {
        onChange({ ...headers, [key]: value });
    }, [headers, onChange]);

    const updateHeaderName = useCallback((key: string, value: string) => {
        onChange(renameHttpHeader(headers, key, value));
    }, [headers, onChange]);

    return (
        <div
            className="space-y-3"
            role="group"
            aria-labelledby={labelId}
            aria-describedby={description ? descriptionId : undefined}
        >
            <div>
                <Label id={labelId}>{resolvedLabel}</Label>
                {description && (
                    <p id={descriptionId} className="text-xs text-muted-foreground">
                        {description}
                    </p>
                )}
            </div>
            {entries.map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                    <HeaderNameInput
                        name={key}
                        headers={headers}
                        onRename={updateHeaderName}
                        disabled={disabled}
                    />
                    <Input
                        value={value}
                        onChange={e => updateHeaderValue(key, e.target.value)}
                        className="flex-1"
                        placeholder={resolvedPlaceholder}
                        aria-label={t`Header value for ${key}`}
                        disabled={disabled}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeHeader(key)}
                        aria-label={t`Remove ${key} header`}
                        disabled={disabled}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            ))}
            <div className="flex items-center gap-2">
                <Input
                    value={newKey}
                    onChange={e => {
                        setNewKey(e.target.value);
                        setNewKeyError(getHeaderNameError(
                            e.target.value.trim(),
                            headers,
                            undefined,
                            t,
                        ));
                    }}
                    placeholder={t`Header name`}
                    className="flex-1"
                    aria-label={t`New header name`}
                    onKeyDown={handleAddKeyDown}
                    aria-invalid={newKeyError !== null}
                    aria-describedby={newKeyError ? newKeyErrorId : undefined}
                    disabled={disabled}
                />
                <Input
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    placeholder={resolvedPlaceholder}
                    className="flex-1"
                    aria-label={t`New header value`}
                    onKeyDown={handleAddKeyDown}
                    disabled={disabled}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addHeader}
                    disabled={disabled || !newKey.trim() || newKeyError !== null}
                    aria-label={t`Add header`}
                >
                    <Plus className="w-4 h-4" />
                </Button>
            </div>
            {newKeyError && (
                <p id={newKeyErrorId} className="text-xs text-destructive" role="alert">
                    {newKeyError}
                </p>
            )}
            {entries.length === 0 && (
                <p className="text-xs text-muted-foreground" role="status">
                    {emptyMessage ?? (
                        <Trans>No custom headers. Add headers using the fields above.</Trans>
                    )}
                </p>
            )}
        </div>
    );
}

interface HeaderNameInputProps {
    readonly name: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly onRename: (previousName: string, nextName: string) => void;
    readonly disabled?: boolean;
}

function HeaderNameInput({
    name,
    headers,
    onRename,
    disabled,
}: HeaderNameInputProps) {
    const { t } = useLingui();
    const [draftName, setDraftName] = useState(name);
    const [error, setError] = useState<string | null>(null);
    const errorId = useId();

    const commit = () => {
        const nextName = draftName.trim();
        const nextError = getHeaderNameError(nextName, headers, name, t);
        setError(nextError);
        if (!nextError && nextName !== name) {
            onRename(name, nextName);
        }
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
        } else if (event.key === 'Escape') {
            setDraftName(name);
            setError(null);
            event.currentTarget.blur();
        }
    };

    return (
        <div className="flex-1">
            <Input
                value={draftName}
                onChange={event => {
                    const nextName = event.target.value;
                    setDraftName(nextName);
                    setError(getHeaderNameError(
                        nextName.trim(),
                        headers,
                        name,
                        t,
                    ));
                }}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                aria-label={t`Header name ${name}`}
                aria-invalid={error !== null}
                aria-describedby={error ? errorId : undefined}
                disabled={disabled}
            />
            {error && (
                <p id={errorId} className="mt-1 text-xs text-destructive" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

function getHeaderNameError(
    name: string,
    headers: Readonly<Record<string, string>>,
    previousName: string | undefined,
    translate: ReturnType<typeof useLingui>['t'],
): string | null {
    if (!name) return translate`Header name is required.`;

    const policyError = getHttpHeaderNameError(name, 'STATIC');
    if (policyError === 'INVALID') return translate`Enter a valid HTTP header name.`;
    if (policyError === 'RESTRICTED') {
        return translate`Use the authentication fields for sensitive or request-control headers.`;
    }
    if (hasHttpHeaderName(headers, name, previousName)) {
        return translate`A header with this name already exists.`;
    }
    return null;
}
