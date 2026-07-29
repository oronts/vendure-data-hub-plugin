import { useCallback, useId, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Button,
    Input,
    Label,
} from '@vendure/dashboard';
import { Plus, X } from 'lucide-react';

interface HeadersEditorProps {
    headers: Record<string, string>;
    onChange: (headers: Record<string, string>) => void;
    label?: string;
    placeholder?: string;
}

export function HeadersEditor({ headers, onChange, label, placeholder }: HeadersEditorProps) {
    const { t } = useLingui();
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const labelId = useId();
    const entries = Object.entries(headers);
    const resolvedLabel = label ?? t`Custom Headers`;
    const resolvedPlaceholder = placeholder
        ?? t`Header value`;

    const addHeader = useCallback(() => {
        const key = newKey.trim();
        if (!key) return;
        onChange({ ...headers, [key]: newValue });
        setNewKey('');
        setNewValue('');
    }, [newKey, newValue, headers, onChange]);

    const handleAddKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
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

    return (
        <div className="space-y-3" role="group" aria-labelledby={labelId}>
            <Label id={labelId}>{resolvedLabel}</Label>
            {entries.map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                    <Input
                        value={key}
                        readOnly
                        className="flex-1 bg-muted"
                        aria-label={t`Header name ${key}`}
                    />
                    <Input
                        value={value}
                        onChange={e => updateHeaderValue(key, e.target.value)}
                        className="flex-1"
                        placeholder={resolvedPlaceholder}
                        aria-label={t`Header value for ${key}`}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeHeader(key)}
                        aria-label={t`Remove ${key} header`}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            ))}
            <div className="flex items-center gap-2">
                <Input
                    value={newKey}
                    onChange={e => setNewKey(e.target.value)}
                    placeholder={t`Header name`}
                    className="flex-1"
                    aria-label={t`New header name`}
                    onKeyDown={handleAddKeyDown}
                />
                <Input
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    placeholder={resolvedPlaceholder}
                    className="flex-1"
                    aria-label={t`New header value`}
                    onKeyDown={handleAddKeyDown}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addHeader}
                    disabled={!newKey.trim()}
                    aria-label={t`Add header`}
                >
                    <Plus className="w-4 h-4" />
                </Button>
            </div>
            {entries.length === 0 && (
                <p className="text-xs text-muted-foreground" role="status">
                    <Trans>No custom headers. Add headers using the fields above.</Trans>
                </p>
            )}
        </div>
    );
}
