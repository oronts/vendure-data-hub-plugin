import { RUN_STATUS_TRANSLATION_IDS } from '../../constants';

type Translate = (id: string) => string;

export function localizeQueueRunStatus(status: string, translate: Translate): string {
    const translationId = RUN_STATUS_TRANSLATION_IDS[
        status as keyof typeof RUN_STATUS_TRANSLATION_IDS
    ];
    return translationId ? translate(translationId) : status;
}
