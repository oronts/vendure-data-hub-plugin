import {
    Badge,
    Button,
    DashboardRouteDefinition,
    ListPage,
    PageActionBarRight,
    PermissionGuard,
    usePermissions,
} from '@vendure/dashboard';
import { useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import type { CellContext } from '@tanstack/react-table';
import type { VariablesOf } from '@graphql-typed-document-node/core';
import {
    DATAHUB_NAV_LABELS,
    DATAHUB_NAV_SECTION,
    DATAHUB_PAGE_LABELS,
    DATAHUB_PERMISSIONS,
    DETAIL_ROUTES,
    ROUTES,
    SECRET_PROVIDER_TRANSLATION_IDS,
    SECRET_SOURCE_TRANSLATION_IDS,
    SECRET_STATUS_TRANSLATION_IDS,
} from '../../constants';
import { deleteSecretDocument, secretsListDocument } from '../../hooks';
import type {
    DataHubSecretsForListQuery,
} from '../../gql/graphql';
import { DetailRouteButton } from '../../components/shared';

type SecretListItem = DataHubSecretsForListQuery['dataHubSecrets']['items'][number];

function SecretStatus({ status }: { readonly status: string }) {
    const { i18n } = useLingui();
    const requiresAttention = status === 'UNENCRYPTED' || status === 'MISSING';
    const translationId = SECRET_STATUS_TRANSLATION_IDS[
        status as keyof typeof SECRET_STATUS_TRANSLATION_IDS
    ];
    return (
        <Badge
            variant="outline"
            className={requiresAttention ? 'border-destructive text-destructive' : undefined}
        >
            {translationId ? i18n._(translationId) : status}
        </Badge>
    );
}

export const secretsList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-secrets',
        url: ROUTES.SECRETS,
        title: DATAHUB_NAV_LABELS.SECRETS,
        requiresPermission: DATAHUB_PERMISSIONS.READ_SECRET,
    },
    path: ROUTES.SECRETS,
    loader: () => ({ breadcrumb: DATAHUB_NAV_LABELS.SECRETS }),
    component: route => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.READ_SECRET]}>
            <SecretsListPage route={route} />
        </PermissionGuard>
    ),
};

type SecretsRoute = Parameters<NonNullable<DashboardRouteDefinition['component']>>[0];

function SecretsListPage({ route }: { route: SecretsRoute }) {
    const { i18n, t } = useLingui();
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
                title={i18n._(DATAHUB_NAV_LABELS.SECRETS)}
                listQuery={secretsListDocument}
                deleteMutation={canDelete ? deleteSecretDocument : undefined}
                route={route}
                customizeColumns={{
                    code: {
                        header: t`Code`,
                        cell: ({ row }: CellContext<SecretListItem, unknown>) => (
                            <div className="flex flex-col gap-1">
                                <DetailRouteButton
                                    route={DETAIL_ROUTES.SECRET}
                                    id={row.original.id}
                                    label={row.original.code}
                                />
                                {row.original.isOverridden && (
                                    <span className="text-xs text-muted-foreground">
                                        {i18n._(SECRET_SOURCE_TRANSLATION_IDS.DATABASE_INACTIVE)}
                                    </span>
                                )}
                            </div>
                        ),
                    },
                    provider: {
                        header: t`Provider`,
                        cell: ({ row }: CellContext<SecretListItem, unknown>) => {
                            const provider = row.original.provider;
                            const translationId = SECRET_PROVIDER_TRANSLATION_IDS[
                                provider as keyof typeof SECRET_PROVIDER_TRANSLATION_IDS
                            ];
                            return translationId ? i18n._(translationId) : provider;
                        },
                    },
                    valueStatus: {
                        header: t`Stored value`,
                        cell: ({ row }: CellContext<SecretListItem, unknown>) => <SecretStatus status={row.original.valueStatus} />,
                    },
                    isOverridden: {
                        header: t`Runtime source`,
                        cell: ({ row }: CellContext<SecretListItem, unknown>) => (
                            <div className="text-sm">
                                <div>
                                    {i18n._(row.original.isOverridden
                                        ? SECRET_SOURCE_TRANSLATION_IDS.CODE_FIRST_ACTIVE
                                        : SECRET_SOURCE_TRANSLATION_IDS.DATABASE_ACTIVE)}
                                </div>
                                {row.original.isOverridden && (
                                    <div className="text-xs text-muted-foreground">
                                        {t`Deleting this row does not remove the active secret`}
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
                            <Link to={DETAIL_ROUTES.SECRET} params={{ id: 'new' }}>
                                {i18n._(DATAHUB_PAGE_LABELS.NEW_SECRET)}
                            </Link>
                        </Button>
                    )}
                </PageActionBarRight>
            </ListPage>
    );
}
