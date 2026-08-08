import { Trans, useLingui } from '@lingui/react/macro';
import { Card, CardContent, CardHeader, CardTitle } from '@vendure/dashboard';
import { getErrorMessage } from '../../../../shared';
import type { ExportTemplate } from '../../../hooks/use-export-templates';
import {
    ErrorState,
    LoadingState,
    SelectableCard,
    SelectableCardGrid,
} from '../../shared';

const QUICK_START_TEMPLATE_COUNT = 4;

interface TemplateQuickStartProps {
    templates: ExportTemplate[];
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    onRetry: () => void;
    onUseTemplate: (template: ExportTemplate) => void;
}

export function TemplateQuickStart({
    templates,
    isLoading,
    isError,
    error,
    onRetry,
    onUseTemplate,
}: Readonly<TemplateQuickStartProps>) {
    const { t } = useLingui();

    if (isLoading) {
        return (
            <LoadingState
                message={t`Loading export configuration...`}
            />
        );
    }
    if (isError) {
        return (
            <ErrorState
                title={t`Export configuration unavailable`}
                message={t`Quick Start with a Template: ${getErrorMessage(error)}`}
                error={error instanceof Error ? error : undefined}
                onRetry={onRetry}
            />
        );
    }
    if (templates.length === 0) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm">
                    <Trans>Quick Start with a Template</Trans>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <SelectableCardGrid columns={4}>
                    {templates.slice(0, QUICK_START_TEMPLATE_COUNT).map(template => (
                        <SelectableCard
                            key={template.id}
                            title={template.name}
                            description={template.description}
                            selected={false}
                            onClick={() => onUseTemplate(template)}
                            data-testid={`datahub-export-template-${template.id}-btn`}
                        />
                    ))}
                </SelectableCardGrid>
            </CardContent>
        </Card>
    );
}
