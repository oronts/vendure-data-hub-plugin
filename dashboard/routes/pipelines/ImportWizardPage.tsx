import * as React from 'react';
import {
    DashboardRouteDefinition,
    Page,
    PageTitle,
    api,
    usePermissions,
} from '@vendure/dashboard';
import { useLingui } from '@lingui/react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    DATAHUB_NAV_LABELS,
    DATAHUB_PAGE_LABELS,
    DATAHUB_PERMISSIONS,
    IMPORT_WIZARD_TRANSLATION_IDS,
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
    const { i18n } = useLingui();
    const entityLoaders = useEntityLoaders();
    const entityFields = useEntityFieldSchemas();
    const loaderAdapters = useAdaptersByType('LOADER');
    const extractorAdapters = useAdaptersByType('EXTRACTOR');
    const configOptions = useConfigOptions();
    return (
        <MetadataQueriesBoundary
            title={i18n._(IMPORT_WIZARD_TRANSLATION_IDS.METADATA_UNAVAILABLE)}
            loadingMessage={i18n._(IMPORT_WIZARD_TRANSLATION_IDS.LOADING_CONFIGURATION)}
            queries={[
                { label: i18n._(IMPORT_WIZARD_TRANSLATION_IDS.SUPPORTED_ENTITIES), ...entityLoaders },
                { label: i18n._(IMPORT_WIZARD_TRANSLATION_IDS.ENTITY_FIELD_SCHEMAS), ...entityFields },
                { label: i18n._(IMPORT_WIZARD_TRANSLATION_IDS.LOADER_ADAPTERS), ...loaderAdapters },
                { label: i18n._(IMPORT_WIZARD_TRANSLATION_IDS.EXTRACTOR_ADAPTERS), ...extractorAdapters },
                { label: i18n._(IMPORT_WIZARD_TRANSLATION_IDS.METADATA_UNAVAILABLE), ...configOptions },
            ]}
        >
            {children}
        </MetadataQueriesBoundary>
    );
}

function ImportWizardPageContent() {
    const { i18n } = useLingui();
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
            toast.success(i18n._(IMPORT_WIZARD_TRANSLATION_IDS.TOAST_CREATED));
            void navigate({ to: `${ROUTES.PIPELINES}/${data.id}` });
        },
        onError: (err) => {
            toast.error(i18n._(IMPORT_WIZARD_TRANSLATION_IDS.TOAST_CREATE_FAILED), {
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
            <PageTitle>{i18n._(DATAHUB_PAGE_LABELS.IMPORT_WIZARD)}</PageTitle>
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
