import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
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
    Puzzle,
    Zap,
    Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../utils';
import { UI_DEFAULTS, TEXTAREA_HEIGHTS } from '../../constants';
import { resolveIconName } from '../../utils/icon-resolver';
import { guessExampleValue } from './AdapterConstants';
import type { DataHubAdapter } from '../../types';
import { AdapterLifecycleBadges } from './AdapterLifecycleBadges';

export function AdapterDetail({ adapter }: Readonly<{ adapter: DataHubAdapter }>) {
    const { t } = useLingui();
    const [copied, setCopied] = React.useState(false);
    const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const Icon = resolveIconName(adapter.icon);

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
            toast.success(t`Configuration copied to clipboard`);
            if (copyTimeoutRef.current) {
                clearTimeout(copyTimeoutRef.current);
            }
            copyTimeoutRef.current = setTimeout(() => setCopied(false), UI_DEFAULTS.COPY_FEEDBACK_TIMEOUT_MS);
        } catch {
            toast.error(t`Failed to copy`);
        }
    };

    const requiredFields = adapter.schema.fields.filter(f => f.required);
    const optionalFields = adapter.schema.fields.filter(f => !f.required);

    return (
        <div className="p-5 space-y-6">
            <AdapterLifecycleBadges
                version={adapter.version}
                deprecated={adapter.deprecated}
            />
            {adapter.deprecated && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {adapter.deprecatedMessage}
                </div>
            )}
            {/* Quick info cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        {Icon ? <Icon className="w-4 h-4" /> : <Puzzle className="w-4 h-4" />}
                    </div>
                    <div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                            {t`Type`}
                        </div>
                        <div className="font-medium text-sm">{adapter.type}</div>
                    </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border">
                    <div className={cn(
                        'p-2 rounded-lg',
                        adapter.pure ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                    )}>
                        <Zap className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                            {t`Pure`}
                        </div>
                        <div className="font-medium text-sm">
                            {adapter.pure ? t`Yes` : t`No`}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border">
                    <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                        <Link2 className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                            {t`Dependencies`}
                        </div>
                        <div className="font-medium text-sm">
                            {adapter.requires?.length
                                ? adapter.requires.join(', ')
                                : t`None`}
                        </div>
                    </div>
                </div>
            </div>

            {/* Configuration Fields */}
            <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-muted-foreground" />
                    {t`Configuration fields`}
                    <Badge variant="secondary" className="text-xs ml-auto">
                        {t`${adapter.schema.fields.length} total`}
                    </Badge>
                </h4>
                <div className="border rounded-xl overflow-x-auto">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{t`Adapter configuration fields`}</caption>
                        <thead>
                            <tr className="bg-muted/50">
                                <th scope="col" className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t`Field`}</th>
                                <th scope="col" className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t`Type`}</th>
                                <th scope="col" className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t`Status`}</th>
                                <th scope="col" className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{t`Description`}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requiredFields.map(field => (
                                <tr key={field.key} className="border-t hover:bg-muted/20 transition-colors">
                                    <td className="px-3 py-2.5">
                                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-medium">
                                            {field.key}
                                        </code>
                                    </td>
                                    <td className="px-3 py-2.5 text-muted-foreground">
                                        <span className="text-xs">{field.type}</span>
                                        {field.options && field.options.length > 0 && (
                                            <span className="ml-1 text-[11px] text-muted-foreground/60">
                                                ({field.options.map(o => o.value).join(' | ')})
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                            {t`Required`}
                                        </Badge>
                                    </td>
                                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                                        {field.description || field.label || '\u2014'}
                                    </td>
                                </tr>
                            ))}
                            {optionalFields.map(field => (
                                <tr key={field.key} className="border-t hover:bg-muted/20 transition-colors">
                                    <td className="px-3 py-2.5">
                                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                            {field.key}
                                        </code>
                                    </td>
                                    <td className="px-3 py-2.5 text-muted-foreground">
                                        <span className="text-xs">{field.type}</span>
                                        {field.options && field.options.length > 0 && (
                                            <span className="ml-1 text-[11px] text-muted-foreground/60">
                                                ({field.options.map(o => o.value).join(' | ')})
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                            {t`Optional`}
                                        </Badge>
                                    </td>
                                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                                        {field.description || field.label || '\u2014'}
                                    </td>
                                </tr>
                            ))}
                            {adapter.schema.fields.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground text-sm">
                                        {t`No configuration fields`}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Example Configuration */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                        <Code2 className="w-4 h-4 text-muted-foreground" />
                        {t`Example configuration`}
                    </h4>
                    <Button variant="outline" size="sm" onClick={copyConfig} data-testid="datahub-adapter-config-copy-button">
                        {copied ? (
                            <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
                        ) : (
                            <Copy className="w-4 h-4 mr-1" />
                        )}
                        {copied ? t`Copied!` : t`Copy`}
                    </Button>
                </div>
                <Textarea
                    value={exampleConfig}
                    readOnly
                    className={`font-mono text-sm ${TEXTAREA_HEIGHTS.ADAPTER_SCHEMA} rounded-xl`}
                />
            </div>
        </div>
    );
}
