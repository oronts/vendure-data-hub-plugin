import * as React from 'react';
import { Input } from '@vendure/dashboard';

export function RetryPatchHelper({ onChange }: { onChange: (p: Record<string, unknown>) => void }) {
    const [values, setValues] = React.useState<Record<string, unknown>>({});

    const handleFieldChange = React.useCallback((key: string, value: string) => {
        setValues(prev => {
            const next = { ...prev, [key]: value };
            onChange(next);
            return next;
        });
    }, [onChange]);

    const handleSlugChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handleFieldChange('slug', e.target.value);
    }, [handleFieldChange]);

    const handleSkuChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handleFieldChange('sku', e.target.value);
    }, [handleFieldChange]);

    const handleCodeChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handleFieldChange('code', e.target.value);
    }, [handleFieldChange]);

    const handleNameChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handleFieldChange('name', e.target.value);
    }, [handleFieldChange]);

    return (
        <div className="grid grid-cols-4 gap-2">
            <div>
                <label className="text-xs text-muted-foreground">slug</label>
                <Input value={String(values.slug ?? '')} onChange={handleSlugChange} />
            </div>
            <div>
                <label className="text-xs text-muted-foreground">sku</label>
                <Input value={String(values.sku ?? '')} onChange={handleSkuChange} />
            </div>
            <div>
                <label className="text-xs text-muted-foreground">code</label>
                <Input value={String(values.code ?? '')} onChange={handleCodeChange} />
            </div>
            <div>
                <label className="text-xs text-muted-foreground">name</label>
                <Input value={String(values.name ?? '')} onChange={handleNameChange} />
            </div>
        </div>
    );
}
