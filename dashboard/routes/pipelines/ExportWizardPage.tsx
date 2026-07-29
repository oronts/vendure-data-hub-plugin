import * as React from 'react';
import {
    DashboardRouteDefinition,
    Page,
    PageTitle,
    api,
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
import { ExportWizard } from '../../components/wizards';
import {
    AllPermissionsGuard,
    MetadataQueriesBoundary,
} from '../../components/shared';
import type { ExportConfiguration } from '../../components/wizards';
import {
    createPipelineDocument,
    pipelineKeys,
    useAdapterCodeMappings,
    useConfigOptions,
} from '../../hooks';
import { useDestinationSchemas, useTriggerTypeSchemas } from '../../hooks/api/use-config-options';
import { useExportEntitySchemas } from '../../hooks/api/use-export-entity-schemas';
import { generatePipelineCode, exportConfigToPipelineDefinition } from '../../utils';
import type { ExportAdapterResolver } from '../../utils/wizard-to-pipeline';
import { getErrorMessage } from '../../../shared';
import type { CreateDataHubPipelineApiMutation } from '../../types';

export const exportWizardPage: DashboardRouteDefinition = {
    path: `${ROUTES.PIPELINES}/export-wizard`,
    loader: () => ({
        breadcrumb: [
            { path: ROUTES.PIPELINES, label: DATAHUB_NAV_LABELS.DATA_HUB },
            DATAHUB_PAGE_LABELS.EXPORT_WIZARD,
        ],
    }),
    component: () => (
        <AllPermissionsGuard requires={[
            DATAHUB_PERMISSIONS.CREATE_PIPELINE,
            DATAHUB_PERMISSIONS.READ_PIPELINE,
            DATAHUB_PERMISSIONS.VIEW_ENTITY_SCHEMAS,
        ]}>
            <ExportWizardMetadataBoundary>
                <ExportWizardPageContent />
            </ExportWizardMetadataBoundary>
        </AllPermissionsGuard>
    ),
};

function ExportWizardMetadataBoundary({ children }: { children: React.ReactNode }) {
    const { t } = useLingui();
    const exportEntities = useExportEntitySchemas();
    const configOptions = useConfigOptions();
    return (
        <MetadataQueriesBoundary
            title={t`Export configuration unavailable`}
            loadingMessage={t`Loading export configuration...`}
            queries={[
                { label: t`Supported entities`, ...exportEntities },
                { label: t`Export configuration unavailable`, ...configOptions },
            ]}
        >
            {children}
        </MetadataQueriesBoundary>
    );
}

function ExportWizardPageContent() {
    const { t } = useLingui();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { mappings: exportMappings } = useAdapterCodeMappings('exportAdapterCodes');
    const { schemas: destinationSchemas } = useDestinationSchemas();
    const { schemas: triggerSchemas } = useTriggerTypeSchemas();

    const resolver = React.useMemo<ExportAdapterResolver>(() => ({
        getExportAdapterCode: (formatType) =>
            exportMappings.find(m => m.value === formatType)?.adapterCode,
    }), [exportMappings]);

    const createMutation = useMutation({
        mutationFn: (config: ExportConfiguration) => {
            const definition = exportConfigToPipelineDefinition(config, resolver, triggerSchemas, destinationSchemas);
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
            toast.success(t`Export configuration created`);
            void navigate({ to: `${ROUTES.PIPELINES}/${data.id}` });
        },
        onError: (err) => {
            toast.error(t`Failed to create export configuration`, {
                description: getErrorMessage(err),
            });
        },
    });
    const { mutate: createPipeline } = createMutation;

    const handleComplete = React.useCallback((config: ExportConfiguration) => {
        createPipeline(config);
    }, [createPipeline]);

    const handleCancel = React.useCallback(() => {
        void navigate({ to: ROUTES.PIPELINES });
    }, [navigate]);

    return (
        <Page>
            <PageTitle><Trans>Export Wizard</Trans></PageTitle>
            <div className="data-hub-responsive-page p-4 md:p-6">
                <ExportWizard onComplete={handleComplete} onCancel={handleCancel} isSubmitting={createMutation.isPending} />
            </div>
        </Page>
    );
}
