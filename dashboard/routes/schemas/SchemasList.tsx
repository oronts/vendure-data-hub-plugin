import {
    Button,
    DashboardRouteDefinition,
    ListPage,
    PageActionBarRight,
    PermissionGuard,
} from '@vendure/dashboard';
import { useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import type { CellContext } from '@tanstack/react-table';
import type { VariablesOf } from '@graphql-typed-document-node/core';
import type { DataHubSchemasForListQuery } from '../../gql/graphql';
import { DetailRouteButton } from '../../components/shared';
import {
    DATAHUB_FIELD_TRANSLATION_IDS,
    DATAHUB_NAV_LABELS,
    DATAHUB_NAV_SECTION,
    DATAHUB_PAGE_LABELS,
    DATAHUB_PERMISSIONS,
    DETAIL_ROUTES,
    ROUTES,
} from '../../constants';
import { schemasListDocument } from '../../hooks';

type SchemaListItem = DataHubSchemasForListQuery['dataHubSchemas']['items'][number];
type SchemasRoute = Parameters<DashboardRouteDefinition['component']>[0];

export const schemasList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-schemas',
        url: ROUTES.SCHEMAS,
        title: DATAHUB_NAV_LABELS.SCHEMAS,
        requiresPermission: DATAHUB_PERMISSIONS.READ_SCHEMA,
    },
    path: ROUTES.SCHEMAS,
    loader: () => ({ breadcrumb: DATAHUB_NAV_LABELS.SCHEMAS }),
    component: route => <SchemasListPage route={route} />,
};

function SchemasListPage({ route }: Readonly<{ route: SchemasRoute }>) {
    const { i18n, t } = useLingui();

    return (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.READ_SCHEMA]}>
            <ListPage<
                typeof schemasListDocument,
                DataHubSchemasForListQuery,
                VariablesOf<typeof schemasListDocument>
            >
                pageId="data-hub-schemas-list"
                title={i18n._(DATAHUB_NAV_LABELS.SCHEMAS)}
                listQuery={schemasListDocument}
                route={route}
                defaultColumnOrder={[
                    'schemaId',
                    'version',
                    'compatibility',
                    'updatedAt',
                ]}
                customizeColumns={{
                    schemaId: {
                        header: t`Schema ID`,
                        cell: ({ row }: CellContext<SchemaListItem, unknown>) => (
                            <DetailRouteButton
                                route={DETAIL_ROUTES.SCHEMA}
                                id={row.original.id}
                                label={row.original.schemaId}
                            />
                        ),
                    },
                    version: {
                        header: i18n._(DATAHUB_FIELD_TRANSLATION_IDS.VERSION),
                    },
                    compatibility: { header: t`Compatibility` },
                }}
            >
                <PageActionBarRight>
                    <PermissionGuard requires={[DATAHUB_PERMISSIONS.CREATE_SCHEMA]}>
                        <Button asChild>
                            <Link to={DETAIL_ROUTES.SCHEMA} params={{ id: 'new' }}>
                                {i18n._(DATAHUB_PAGE_LABELS.NEW_SCHEMA)}
                            </Link>
                        </Button>
                    </PermissionGuard>
                </PageActionBarRight>
            </ListPage>
        </PermissionGuard>
    );
}
