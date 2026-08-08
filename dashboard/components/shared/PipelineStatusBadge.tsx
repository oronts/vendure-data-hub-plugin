import { useLingui } from '@lingui/react/macro';
import { Badge } from '@vendure/dashboard';
import {
    COMMON_VALUE_TRANSLATION_IDS,
    PIPELINE_STATUS,
    PIPELINE_STATUS_TRANSLATION_IDS,
    getStatusBadgeVariant,
} from '../../constants';

export function PipelineStatusBadge({
    status,
}: Readonly<{ status?: string | null }>) {
    const { i18n } = useLingui();
    const pipelineStatus = status || PIPELINE_STATUS.DRAFT;
    const translationId = PIPELINE_STATUS_TRANSLATION_IDS[
        pipelineStatus as keyof typeof PIPELINE_STATUS_TRANSLATION_IDS
    ];

    return (
        <Badge variant={getStatusBadgeVariant(pipelineStatus)}>
            {translationId ? i18n._(translationId) : pipelineStatus}
        </Badge>
    );
}

export function BooleanStatusBadge({
    enabled,
}: Readonly<{ enabled: boolean }>) {
    const { i18n } = useLingui();

    return (
        <Badge variant={enabled ? 'secondary' : 'destructive'}>
            {i18n._(
                enabled
                    ? COMMON_VALUE_TRANSLATION_IDS.ENABLED
                    : COMMON_VALUE_TRANSLATION_IDS.DISABLED,
            )}
        </Badge>
    );
}
