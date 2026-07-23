import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@vendure/dashboard';
import { Link } from '@tanstack/react-router';
import { GitCompare } from 'lucide-react';
import type {
    DataHubSchemaDetailApiQuery,
    DataHubSchemaVersionsApiQuery,
} from '../../gql/graphql';
import { DETAIL_ROUTES } from '../../constants';
import { useSchemaVersions } from '../../hooks';
import { getErrorMessage } from '../../../shared';
import {
    compareSchemaDefinitions,
    SchemaDefinitionChange,
} from './schema-definition-diff';

type CurrentSchema = NonNullable<DataHubSchemaDetailApiQuery['dataHubSchema']>;
type SchemaVersion = DataHubSchemaVersionsApiQuery['dataHubSchemaVersions'][number];

export function SchemaVersionHistory({ current }: Readonly<{ current: CurrentSchema }>) {
    const { i18n, t } = useLingui();
    const versions = useSchemaVersions(current.schemaId);
    const [comparison, setComparison] = React.useState<SchemaVersion>();
    const changes = React.useMemo(
        () => comparison
            ? compareSchemaDefinitions(comparison.definition, current.definition)
            : [],
        [comparison, current.definition],
    );

    return (
        <>
            <section className="space-y-3">
                <h3 className="text-sm font-medium"><Trans>Version history</Trans></h3>
                {versions.isPending ? (
                    <p className="text-sm text-muted-foreground"><Trans>Loading versions…</Trans></p>
                ) : versions.isError ? (
                    <div className="space-y-2 text-sm text-destructive">
                        <p><Trans>Could not load schema versions.</Trans></p>
                        <p className="text-xs">{getErrorMessage(versions.error)}</p>
                        <Button type="button" variant="outline" size="sm" onClick={() => versions.refetch()}>
                            <Trans>Retry</Trans>
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {versions.data?.map(version => {
                            const isCurrent = String(version.id) === String(current.id);
                            return (
                                <div
                                    key={String(version.id)}
                                    className="rounded-md border p-3 text-sm"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            {isCurrent ? (
                                                <span className="font-medium">{version.version}</span>
                                            ) : (
                                                <Link
                                                    to={DETAIL_ROUTES.SCHEMA}
                                                    params={{ id: String(version.id) }}
                                                    className="font-medium hover:underline"
                                                >
                                                    {version.version}
                                                </Link>
                                            )}
                                            <p className="text-xs text-muted-foreground">
                                                {version.compatibility} · {i18n.date(
                                                    new Date(version.createdAt),
                                                    { dateStyle: 'medium' },
                                                )}
                                            </p>
                                        </div>
                                        {isCurrent ? (
                                            <Badge variant="secondary"><Trans>Current</Trans></Badge>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setComparison(version)}
                                                aria-label={t`Compare version ${version.version} with ${current.version}`}
                                            >
                                                <GitCompare className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <Dialog
                open={comparison != null}
                onOpenChange={open => {
                    if (!open) setComparison(undefined);
                }}
            >
                <DialogContent className="max-h-[80vh] max-w-4xl overflow-auto">
                    <DialogHeader>
                        <DialogTitle><Trans>Compare schema versions</Trans></DialogTitle>
                        <DialogDescription>
                            {comparison
                                ? `${comparison.version} → ${current.version}`
                                : ''}
                        </DialogDescription>
                    </DialogHeader>
                    {changes.length === 0 ? (
                        <p className="rounded-md border p-4 text-sm text-muted-foreground">
                            <Trans>The schema definitions are identical.</Trans>
                        </p>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-sm">
                                {t`${changes.length} definition changes`}
                            </p>
                            {changes.map(change => (
                                <SchemaChange key={`${change.type}:${change.path}`} change={change} />
                            ))}
                        </div>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => setComparison(undefined)}>
                            <Trans>Close</Trans>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function SchemaChange({ change }: Readonly<{ change: SchemaDefinitionChange }>) {
    const { t } = useLingui();
    const label = change.type === 'ADDED'
        ? t`Added`
        : change.type === 'REMOVED'
            ? t`Removed`
            : t`Modified`;

    return (
        <div className="rounded-md border p-3 text-xs">
            <div className="mb-2 flex items-center justify-between gap-3">
                <code className="font-medium">{change.path}</code>
                <Badge variant="outline">{label}</Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
                <DiffValue label={t`Before`} value={change.before} />
                <DiffValue label={t`After`} value={change.after} />
            </div>
        </div>
    );
}

function DiffValue({ label, value }: Readonly<{ label: string; value: unknown }>) {
    return (
        <div className="min-w-0">
            <p className="mb-1 text-muted-foreground">{label}</p>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
                {formatDiffValue(value)}
            </pre>
        </div>
    );
}

function formatDiffValue(value: unknown): string {
    if (value === undefined) return '—';
    return JSON.stringify(value, null, 2) ?? String(value);
}
