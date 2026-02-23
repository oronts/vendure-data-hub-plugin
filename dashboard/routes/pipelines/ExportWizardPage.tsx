import * as React from 'react';
import {
    DashboardRouteDefinition,
    Page,
    PageTitle,
    PermissionGuard,
    api,
} from '@vendure/dashboard';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DATAHUB_PERMISSIONS, ROUTES, TOAST_WIZARD } from '../../constants';
import { ExportWizard } from '../../components/wizards';
import type { ExportConfiguration } from '../../components/wizards';
import { createPipelineDocument, pipelineKeys, useAdapterCodeMappings, useAdaptersByType } from '../../hooks';
import { useDestinationSchemas, useTriggerTypeSchemas } from '../../hooks/api/use-config-options';
import { generatePipelineCode, exportConfigToPipelineDefinition } from '../../utils';
import type { AdapterResolver } from '../../utils/wizard-to-pipeline';
import { getErrorMessage } from '../../../shared';

export const exportWizardPage: DashboardRouteDefinition = {
    path: `${ROUTES.PIPELINES}/export-wizard`,
    loader: () => ({
        breadcrumb: [
            { path: ROUTES.PIPELINES, label: 'Data Hub' },
            'Export Wizard',
        ],
    }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.CREATE_PIPELINE]}>
            <ExportWizardPageContent />
        </PermissionGuard>
    ),
};

function ExportWizardPageContent() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { mappings: exportMappings } = useAdapterCodeMappings('exportAdapterCodes');
    const { mappings: feedMappings } = useAdapterCodeMappings('feedAdapterCodes');
    const { data: exporterAdapters } = useAdaptersByType('EXPORTER');
    const { data: feedAdapters } = useAdaptersByType('FEED');
    const { schemas: destinationSchemas } = useDestinationSchemas();
    const { schemas: triggerSchemas } = useTriggerTypeSchemas();

    const resolver = React.useMemo<AdapterResolver>(() => ({
        getLoaderAdapterCode: () => undefined,
        getExportAdapterCode: (formatType) =>
            exportMappings.find(m => m.value === formatType)?.adapterCode
            ?? exporterAdapters?.find(a => a.formatType === formatType)?.code,
        getFeedAdapterCode: (formatType) =>
            feedMappings.find(m => m.value === formatType)?.adapterCode
            ?? feedAdapters?.find(a => a.formatType === formatType)?.code,
    }), [exportMappings, feedMappings, exporterAdapters, feedAdapters]);

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
            }).then(res => res.createDataHubPipeline);
        },
        onSuccess: async (data) => {
            await queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
            toast.success(TOAST_WIZARD.EXPORT_CREATED);
            void navigate({ to: `${ROUTES.PIPELINES}/${data.id}` });
        },
        onError: (err) => {
            toast.error(TOAST_WIZARD.CREATE_FAILED, {
                description: getErrorMessage(err),
            });
        },
    });

    const handleComplete = React.useCallback((config: ExportConfiguration) => {
        createMutation.mutate(config);
    }, [createMutation.mutate]);

    const handleCancel = React.useCallback(() => {
        void navigate({ to: ROUTES.PIPELINES });
    }, [navigate]);

    return (
        <Page>
            <PageTitle title="Export Wizard" />
            <div className="p-6">
                <ExportWizard onComplete={handleComplete} onCancel={handleCancel} isSubmitting={createMutation.isPending} />
            </div>
        </Page>
    );
}
