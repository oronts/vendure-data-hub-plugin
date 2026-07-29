import * as React from 'react';
import {
    DashboardRouteDefinition,
    Page,
    PageTitle,
    api,
    usePermissions,
} from '@vendure/dashboard';
import { Trans, useLingui } from '@lingui/react/macro';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    DATAHUB_NAV_LABELS,
    DATAHUB_PAGE_LABELS,
    DATAHUB_PERMISSIONS,
    ROUTES,
} from '../../constants';
import { ImportWizard } from '../../components/wizards';
import {
    AllPermissionsGuard,
    MetadataQueriesBoundary,
} from '../../components/shared';
import type { ImportConfiguration } from '../../components/wizards';
import {
    createPipelineDocument,
    pipelineKeys,
    useAdaptersByType,
    useConfigOptions,
    useWizardStrategyMappings,
} from '../../hooks';
import { useEntityLoaders } from '../../hooks/api/use-entity-loaders';
import { useEntityFieldSchemas } from '../../hooks/api/use-entity-field-schemas';
import { useTriggerTypeSchemas } from '../../hooks/api/use-config-options';
import { generatePipelineCode, importConfigToPipelineDefinition } from '../../utils';
import type { ImportAdapterResolver, LoaderAdapterInfo } from '../../utils/wizard-to-pipeline';
import { getErrorMessage } from '../../../shared';
import type { CreateDataHubPipelineApiMutation } from '../../types';

export const importWizardPage: DashboardRouteDefinition = {
    path: `${ROUTES.PIPELINES}/import-wizard`,
    loader: () => ({
        breadcrumb: [
            { path: ROUTES.PIPELINES, label: DATAHUB_NAV_LABELS.DATA_HUB },
            DATAHUB_PAGE_LABELS.IMPORT_WIZARD,
        ],
    }),
    component: () => (
        <AllPermissionsGuard requires={[
            DATAHUB_PERMISSIONS.CREATE_PIPELINE,
            DATAHUB_PERMISSIONS.READ_PIPELINE,
            DATAHUB_PERMISSIONS.VIEW_ENTITY_SCHEMAS,
            DATAHUB_PERMISSIONS.MANAGE_ADAPTERS,
        ]}>
            <ImportWizardMetadataBoundary>
                <ImportWizardPageContent />
            </ImportWizardMetadataBoundary>
        </AllPermissionsGuard>
    ),
};

function ImportWizardMetadataBoundary({ children }: { children: React.ReactNode }) {
    const { t } = useLingui();
    const entityLoaders = useEntityLoaders();
    const entityFields = useEntityFieldSchemas();
    const loaderAdapters = useAdaptersByType('LOADER');
    const extractorAdapters = useAdaptersByType('EXTRACTOR');
    const configOptions = useConfigOptions();
    return (
        <MetadataQueriesBoundary
            title={t`Import configuration unavailable`}
            loadingMessage={t`Loading import configuration...`}
            queries={[
                { label: t`Supported entities`, ...entityLoaders },
                { label: t`Entity field schemas`, ...entityFields },
                { label: t`Loader adapters`, ...loaderAdapters },
                { label: t`Source adapters`, ...extractorAdapters },
                { label: t`Import configuration unavailable`, ...configOptions },
            ]}
        >
            {children}
        </MetadataQueriesBoundary>
    );
}

function ImportWizardPageContent() {
    const { t } = useLingui();
    const { hasPermissions } = usePermissions();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { getLoaderAdapterCode } = useEntityLoaders();
    const { data: loaderAdapters } = useAdaptersByType('LOADER');
    const { mappings: strategyMappings } = useWizardStrategyMappings();
    const { schemas: triggerSchemas } = useTriggerTypeSchemas();
    const canManageFiles = hasPermissions([DATAHUB_PERMISSIONS.MANAGE_FILES]);

    const resolver = React.useMemo<ImportAdapterResolver>(() => ({
        getLoaderAdapterCode,
    }), [getLoaderAdapterCode]);

    const loaderAdapterInfos = React.useMemo<LoaderAdapterInfo[] | undefined>(
        () => loaderAdapters?.map(a => ({
            code: a.code,
            entityType: a.entityType,
            schema: a.schema ? { fields: a.schema.fields.map(f => ({ key: f.key })) } : undefined,
        })),
        [loaderAdapters],
    );

    const createMutation = useMutation({
        mutationFn: (config: ImportConfiguration) => {
            const definition = importConfigToPipelineDefinition(config, strategyMappings, resolver, loaderAdapterInfos, triggerSchemas);
            return api.mutate(createPipelineDocument, {
                input: {
                    code: generatePipelineCode(config.name),
                    name: config.name,
                    definition,
                    enabled: false,
                },
            }).then(res => (res as CreateDataHubPipelineApiMutation).createDataHubPipeline);
        },
        onSuccess: async (data) => {
            await queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
            toast.success(t`Import configuration created`);
            void navigate({ to: `${ROUTES.PIPELINES}/${data.id}` });
        },
        onError: (err) => {
            toast.error(t`Failed to create import configuration`, {
                description: getErrorMessage(err),
            });
        },
    });
    const { mutate: createPipeline } = createMutation;

    const handleComplete = React.useCallback((config: ImportConfiguration) => {
        createPipeline(config);
    }, [createPipeline]);

    const handleCancel = React.useCallback(() => {
        void navigate({ to: ROUTES.PIPELINES });
    }, [navigate]);

    return (
        <Page>
            <PageTitle><Trans>Import Wizard</Trans></PageTitle>
            <div className="data-hub-responsive-page p-4 md:p-6">
                <ImportWizard
                    onComplete={handleComplete}
                    onCancel={handleCancel}
                    canManageFiles={canManageFiles}
                    isSubmitting={createMutation.isPending}
                />
            </div>
        </Page>
    );
}
