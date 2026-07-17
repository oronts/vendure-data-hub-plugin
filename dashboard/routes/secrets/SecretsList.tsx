import {
    Badge,
    Button,
    DashboardRouteDefinition,
    DetailPageButton,
    ListPage,
    PageActionBarRight,
    PermissionGuard,
    usePermissions,
} from '@vendure/dashboard';
import { Link } from '@tanstack/react-router';
import type { CellContext } from '@tanstack/react-table';
import type { VariablesOf } from '@graphql-typed-document-node/core';
import { DATAHUB_NAV_SECTION, DATAHUB_PERMISSIONS, ROUTES } from '../../constants';
import { deleteSecretDocument, secretsListDocument } from '../../hooks';
import type {
    DataHubSecretsForListQuery,
} from '../../gql/graphql';

type SecretListItem = DataHubSecretsForListQuery['dataHubSecrets']['items'][number];

const SECRET_STATUS_LABELS: Readonly<Record<string, string>> = {
    ENCRYPTED: 'Encrypted',
    ENV_REFERENCE: 'Environment reference',
    UNENCRYPTED: 'Unencrypted',
    MISSING: 'Missing value',
};

function SecretStatus({ status }: { readonly status: string }) {
    const requiresAttention = status === 'UNENCRYPTED' || status === 'MISSING';
    return (
        <Badge
            variant="outline"
            className={requiresAttention ? 'border-destructive text-destructive' : undefined}
        >
            {SECRET_STATUS_LABELS[status] ?? status}
        </Badge>
    );
}

export const secretsList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-secrets',
        url: ROUTES.SECRETS,
        title: 'Secrets',
        requiresPermission: DATAHUB_PERMISSIONS.READ_SECRET,
    },
    path: ROUTES.SECRETS,
    loader: () => ({ breadcrumb: 'Secrets' }),
    component: route => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.READ_SECRET]}>
            <SecretsListPage route={route} />
        </PermissionGuard>
    ),
};

type SecretsRoute = Parameters<NonNullable<DashboardRouteDefinition['component']>>[0];

function SecretsListPage({ route }: { route: SecretsRoute }) {
    const { hasPermissions } = usePermissions();
    const canCreate = hasPermissions([DATAHUB_PERMISSIONS.CREATE_SECRET]);
    const canDelete = hasPermissions([DATAHUB_PERMISSIONS.DELETE_SECRET]);

    return (
        <ListPage<
                typeof secretsListDocument,
                DataHubSecretsForListQuery,
                VariablesOf<typeof secretsListDocument>
            >
                pageId="data-hub-secrets-list"
                title="Secrets"
                listQuery={secretsListDocument}
                deleteMutation={canDelete ? deleteSecretDocument : undefined}
                route={route}
                customizeColumns={{
                    code: {
                        header: 'Code',
                        cell: ({ row }: CellContext<SecretListItem, unknown>) => (
                            <div className="flex flex-col gap-1">
                                <DetailPageButton id={String(row.original.id)} label={row.original.code} />
                                {row.original.isOverridden && (
                                    <span className="text-xs text-muted-foreground">
                                        Database row is inactive
                                    </span>
                                )}
                            </div>
                        ),
                    },
                    provider: { header: 'Provider' },
                    valueStatus: {
                        header: 'Stored value',
                        cell: ({ row }: CellContext<SecretListItem, unknown>) => <SecretStatus status={row.original.valueStatus} />,
                    },
                    isOverridden: {
                        header: 'Runtime source',
                        cell: ({ row }: CellContext<SecretListItem, unknown>) => (
                            <div className="text-sm">
                                <div>{row.original.isOverridden ? 'Code-first active' : 'Database active'}</div>
                                {row.original.isOverridden && (
                                    <div className="text-xs text-muted-foreground">
                                        Deleting this row does not remove the active secret
                                    </div>
                                )}
                            </div>
                        ),
                    },
                }}
            >
                <PageActionBarRight>
                    {canCreate && (
                        <Button asChild data-testid="datahub-secret-create-button">
                            <Link to="./new">New secret</Link>
                        </Button>
                    )}
                </PageActionBarRight>
            </ListPage>
    );
}
