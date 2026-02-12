import * as React from 'react';
import {
    Button,
    Badge,
    Textarea,
} from '@vendure/dashboard';
import {
    Copy,
    CheckCircle2,
    Code2,
    Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { UI_DEFAULTS, TEXTAREA_HEIGHTS, TOAST_ADAPTER } from '../../constants';
import { ADAPTER_TYPE_INFO, guessExampleValue } from './constants';
import type { DataHubAdapter } from '../../types';

export function AdapterDetail({ adapter }: Readonly<{ adapter: DataHubAdapter }>) {
    const [copied, setCopied] = React.useState(false);
    const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cleanup timeout on unmount
    React.useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) {
                clearTimeout(copyTimeoutRef.current);
            }
        };
    }, []);

    const exampleConfig = React.useMemo(() => {
        const config: Record<string, unknown> = { adapterCode: adapter.code };
        for (const field of adapter.schema.fields) {
            if (field.required) {
                config[field.key] = guessExampleValue(field.type, field.options);
            }
        }
        return JSON.stringify(config, null, 2);
    }, [adapter]);

    const copyConfig = async () => {
        try {
            await navigator.clipboard.writeText(exampleConfig);
            setCopied(true);
            toast.success(TOAST_ADAPTER.CONFIG_COPIED);
            // Clear any existing timeout before setting a new one
            if (copyTimeoutRef.current) {
                clearTimeout(copyTimeoutRef.current);
            }
            copyTimeoutRef.current = setTimeout(() => setCopied(false), UI_DEFAULTS.COPY_FEEDBACK_TIMEOUT_MS);
        } catch {
            toast.error(TOAST_ADAPTER.COPY_ERROR);
        }
    };

    return (
        <div className="p-4 space-y-6">
            <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground mb-1">Type</div>
                    <Badge className={ADAPTER_TYPE_INFO[adapter.type].color}>
                        {adapter.type}
                    </Badge>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground mb-1">Pure Function</div>
                    <div className="font-medium">{adapter.pure ? 'Yes' : 'No'}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground mb-1">Dependencies</div>
                    <div className="font-medium">
                        {adapter.requires?.length ? adapter.requires.join(', ') : 'None'}
                    </div>
                </div>
            </div>

            <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Settings2 className="w-4 h-4" />
                    Configuration Fields
                </h4>
                <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-muted">
                                <th className="text-left px-3 py-2">Field</th>
                                <th className="text-left px-3 py-2">Type</th>
                                <th className="text-left px-3 py-2">Required</th>
                                <th className="text-left px-3 py-2">Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {adapter.schema.fields.map(field => (
                                <tr key={field.key} className="border-t">
                                    <td className="px-3 py-2">
                                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                            {field.key}
                                        </code>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground">
                                        {field.type}
                                        {field.options && field.options.length > 0 && (
                                            <span className="ml-1 text-xs">
                                                ({field.options.map(o => o.value).join(' | ')})
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        {field.required ? (
                                            <Badge variant="destructive" className="text-xs">
                                                Required
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-xs">
                                                Optional
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground">
                                        {field.description || field.label || '—'}
                                    </td>
                                </tr>
                            ))}
                            {adapter.schema.fields.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                                        No configuration fields
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                        <Code2 className="w-4 h-4" />
                        Example Configuration
                    </h4>
                    <Button variant="outline" size="sm" onClick={copyConfig} data-testid="datahub-adapter-config-copy-button">
                        {copied ? (
                            <CheckCircle2 className="w-4 h-4 mr-1 text-green-600" />
                        ) : (
                            <Copy className="w-4 h-4 mr-1" />
                        )}
                        {copied ? 'Copied!' : 'Copy'}
                    </Button>
                </div>
                <Textarea
                    value={exampleConfig}
                    readOnly
                    className={`font-mono text-sm ${TEXTAREA_HEIGHTS.ADAPTER_SCHEMA}`}
                />
            </div>
        </div>
    );
}
