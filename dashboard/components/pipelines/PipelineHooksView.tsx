import { Trans } from '@lingui/react/macro';
import { Webhook, Zap } from 'lucide-react';

import { resolveIconName } from '../../utils';
import type { ConfiguredHookStageGroup } from './pipeline-editor-view-model';

interface PipelineHooksViewProps {
    readonly groups: readonly ConfiguredHookStageGroup[];
    readonly hookCount: number;
    readonly compact?: boolean;
    readonly statusLabel?: string;
}

export function PipelineHooksView({
    groups,
    hookCount,
    compact = false,
    statusLabel,
}: PipelineHooksViewProps) {
    if (compact) {
        return (
            <div className="flex-1 overflow-auto">
                <div className="p-3 border-b bg-muted/50">
                    <h3 className="font-semibold text-sm"><Trans>Pipeline hooks</Trans></h3>
                    <p className="text-xs text-muted-foreground">{statusLabel}</p>
                </div>
                <div className="p-2 space-y-3">
                    {groups.map(group => (
                        <CompactHookGroup key={group.category.key} group={group} />
                    ))}
                    {hookCount === 0 && <EmptyHooks compact />}
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
                <Webhook className="h-5 w-5 text-primary" />
                <h3 className="font-semibold"><Trans>Pipeline hooks</Trans></h3>
                <span className="text-xs text-muted-foreground">(<Trans>read-only</Trans>)</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
                <Trans>Hooks run custom code at specific points during pipeline execution. They are defined in code through the pipeline builder DSL.</Trans>
            </p>
            {hookCount > 0 ? (
                <div className="space-y-4">
                    {groups.map(group => (
                        <DetailedHookGroup key={group.category.key} group={group} />
                    ))}
                </div>
            ) : (
                <EmptyHooks />
            )}
        </div>
    );
}

function CompactHookGroup({ group }: { readonly group: ConfiguredHookStageGroup }) {
    return (
        <div>
            <div className="flex items-center gap-1.5 mb-1.5 px-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${group.category.color}`}>
                    {group.category.label}
                </span>
            </div>
            <div className="space-y-1">
                {group.stages.map(stage => {
                    const Icon = resolveIconName(stage.icon) ?? Zap;
                    return (
                        <div key={stage.key} className="px-2 py-1.5 rounded bg-muted/50 border text-xs">
                            <div className="flex items-center gap-1.5 font-medium">
                                <Icon className="h-3 w-3 text-muted-foreground" />
                                {stage.label}
                                <span className="text-muted-foreground">({stage.hooks.length})</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function DetailedHookGroup({ group }: { readonly group: ConfiguredHookStageGroup }) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${group.category.color}`}>
                    {group.category.label}
                </span>
                <span className="text-xs text-muted-foreground">{group.category.description}</span>
            </div>
            <div className="space-y-2">
                {group.stages.map(stage => {
                    const Icon = resolveIconName(stage.icon) ?? Zap;
                    return (
                        <div key={stage.key} className="p-3 rounded-lg border bg-muted/30">
                            <div className="flex items-center gap-2 mb-2">
                                <Icon className="h-4 w-4 text-primary" />
                                <span className="text-sm font-medium">{stage.label}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{stage.description}</p>
                            <div className="space-y-1">
                                {stage.hooks.map((hook, index) => {
                                    const record = isRecord(hook) ? hook : {};
                                    return (
                                        <div key={index} className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-background border">
                                            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
                                                {String(record.type ?? 'UNKNOWN')}
                                            </span>
                                            <span className="text-muted-foreground truncate">
                                                {getHookDescription(record)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function EmptyHooks({ compact = false }: { readonly compact?: boolean }) {
    return (
        <div className={compact
            ? 'p-4 text-center text-muted-foreground text-xs'
            : 'flex flex-col items-center justify-center py-12 text-muted-foreground'}
        >
            <Webhook className={compact ? 'h-6 w-6 mx-auto mb-2 opacity-30' : 'h-12 w-12 mb-4 opacity-20'} />
            <p className={compact ? undefined : 'text-sm font-medium'}><Trans>No hooks configured</Trans></p>
            <p className={compact ? 'mt-1' : 'text-xs mt-1 text-center max-w-xs'}>
                {compact ? (
                    <Trans>Hooks are defined in code through the pipeline builder DSL.</Trans>
                ) : (
                    <><Trans>Add hooks through the pipeline builder DSL using</Trans>{' '}<code className="px-1 py-0.5 bg-muted rounded text-xs">.hooks()</code></>
                )}
            </p>
        </div>
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getHookDescription(hook: Record<string, unknown>): string {
    return String(hook.name ?? hook.scriptName ?? hook.event ?? hook.message ?? '');
}
