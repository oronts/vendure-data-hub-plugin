import { useCallback, useState } from 'react';
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

export function HeadersEditor({ headers, onChange, label = 'Custom Headers', placeholder = 'Header value' }: HeadersEditorProps) {
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const entries = Object.entries(headers);

    const addHeader = useCallback(() => {
        const key = newKey.trim();
        if (!key) return;
        onChange({ ...headers, [key]: newValue });
        setNewKey('');
        setNewValue('');
    }, [newKey, newValue, headers, onChange]);

    const removeHeader = useCallback((key: string) => {
        const next = { ...headers };
        delete next[key];
        onChange(next);
    }, [headers, onChange]);

    const updateHeaderValue = useCallback((key: string, value: string) => {
        onChange({ ...headers, [key]: value });
    }, [headers, onChange]);

    return (
        <div className="space-y-3">
            <Label>{label}</Label>
            {entries.map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                    <Input value={key} readOnly className="flex-1 bg-muted" />
                    <Input
                        value={value}
                        onChange={e => updateHeaderValue(key, e.target.value)}
                        className="flex-1"
                        placeholder={placeholder}
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeHeader(key)}
                        aria-label={`Remove ${key} header`}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            ))}
            <div className="flex items-center gap-2">
                <Input
                    value={newKey}
                    onChange={e => setNewKey(e.target.value)}
                    placeholder="Header name"
                    className="flex-1"
                />
                <Input
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1"
                    onKeyDown={e => { if (e.key === 'Enter') addHeader(); }}
                />
                <Button
                    variant="outline"
                    size="icon"
                    onClick={addHeader}
                    disabled={!newKey.trim()}
                    aria-label="Add header"
                >
                    <Plus className="w-4 h-4" />
                </Button>
            </div>
            {entries.length === 0 && (
                <p className="text-xs text-muted-foreground">No custom headers. Add headers using the fields above.</p>
            )}
        </div>
    );
}
