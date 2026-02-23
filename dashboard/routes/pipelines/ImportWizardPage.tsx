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
import { ImportWizard } from '../../components/wizards';
import type { ImportConfiguration } from '../../components/wizards';
import { createPipelineDocument, pipelineKeys, useAdapterCodeMappings, useAdaptersByType, useWizardStrategyMappings } from '../../hooks';
import { useEntityLoaders } from '../../hooks/api/use-entity-loaders';
import { useTriggerTypeSchemas } from '../../hooks/api/use-config-options';
import { generatePipelineCode, importConfigToPipelineDefinition } from '../../utils';
import type { AdapterResolver, LoaderAdapterInfo } from '../../utils/wizard-to-pipeline';
import { getErrorMessage } from '../../../shared';

export const importWizardPage: DashboardRouteDefinition = {
    path: `${ROUTES.PIPELINES}/import-wizard`,
    loader: () => ({
        breadcrumb: [
            { path: ROUTES.PIPELINES, label: 'Data Hub' },
            'Import Wizard',
        ],
    }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.CREATE_PIPELINE]}>
            <ImportWizardPageContent />
        </PermissionGuard>
    ),
};

function ImportWizardPageContent() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { getLoaderAdapterCode } = useEntityLoaders();
    const { data: loaderAdapters } = useAdaptersByType('LOADER');
    const { mappings: exportMappings } = useAdapterCodeMappings('exportAdapterCodes');
    const { mappings: feedMappings } = useAdapterCodeMappings('feedAdapterCodes');
    const { mappings: strategyMappings } = useWizardStrategyMappings();
    const { schemas: triggerSchemas } = useTriggerTypeSchemas();

    const resolver = React.useMemo<AdapterResolver>(() => ({
        getLoaderAdapterCode,
        getExportAdapterCode: (formatType) =>
            exportMappings.find(m => m.value === formatType)?.adapterCode,
        getFeedAdapterCode: (formatType) =>
            feedMappings.find(m => m.value === formatType)?.adapterCode,
    }), [getLoaderAdapterCode, exportMappings, feedMappings]);

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
            const definition = importConfigToPipelineDefinition(config, resolver, loaderAdapterInfos, triggerSchemas, strategyMappings);
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
            toast.success(TOAST_WIZARD.IMPORT_CREATED);
            void navigate({ to: `${ROUTES.PIPELINES}/${data.id}` });
        },
        onError: (err) => {
            toast.error(TOAST_WIZARD.CREATE_FAILED, {
                description: getErrorMessage(err),
            });
        },
    });

    const handleComplete = React.useCallback((config: ImportConfiguration) => {
        createMutation.mutate(config);
    }, [createMutation.mutate]);

    const handleCancel = React.useCallback(() => {
        void navigate({ to: ROUTES.PIPELINES });
    }, [navigate]);

    return (
        <Page>
            <PageTitle title="Import Wizard" />
            <div className="p-6">
                <ImportWizard onComplete={handleComplete} onCancel={handleCancel} isSubmitting={createMutation.isPending} />
            </div>
        </Page>
    );
}
