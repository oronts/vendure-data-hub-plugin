export const PIPELINE_STATUS_TRANSLATION_IDS = {
    DRAFT: /* i18n */ 'pipelineStatus.draft',
    REVIEW: /* i18n */ 'pipelineStatus.review',
    PUBLISHED: /* i18n */ 'pipelineStatus.published',
    ARCHIVED: /* i18n */ 'pipelineStatus.archived',
} as const;

export const RUN_STATUS_TRANSLATION_IDS = {
    PENDING: /* i18n */ 'runStatus.pending',
    RUNNING: /* i18n */ 'runStatus.running',
    PAUSED: /* i18n */ 'runStatus.paused',
    COMPLETED: /* i18n */ 'runStatus.completed',
    FAILED: /* i18n */ 'runStatus.failed',
    TIMEOUT: /* i18n */ 'runStatus.timeout',
    CANCELLED: /* i18n */ 'runStatus.cancelled',
    CANCEL_REQUESTED: /* i18n */ 'runStatus.cancelRequested',
} as const;

export const REVISION_RUN_STATUS_TRANSLATION_IDS = {
    SUCCESS: /* i18n */ 'revisionRunStatus.success',
    FAILED: /* i18n */ 'revisionRunStatus.failed',
    PARTIAL: /* i18n */ 'revisionRunStatus.partial',
} as const;

export const COMMON_VALUE_TRANSLATION_IDS = {
    ENABLED: /* i18n */ 'common.enabled',
    DISABLED: /* i18n */ 'common.disabled',
    AND: /* i18n */ 'common.and',
    OR: /* i18n */ 'common.or',
} as const;

export const SECRET_STATUS_TRANSLATION_IDS = {
    ENCRYPTED: /* i18n */ 'secretStatus.encrypted',
    ENV_REFERENCE: /* i18n */ 'secretStatus.environmentReference',
    UNENCRYPTED: /* i18n */ 'secretStatus.unencrypted',
    MISSING: /* i18n */ 'secretStatus.missing',
} as const;

export const SECRET_PROVIDER_TRANSLATION_IDS = {
    INLINE: /* i18n */ 'secretProvider.inline',
    ENV: /* i18n */ 'secretProvider.environment',
} as const;

export const SECRET_SOURCE_TRANSLATION_IDS = {
    CODE_FIRST_ACTIVE: /* i18n */ 'secretSource.codeFirstActive',
    DATABASE_ACTIVE: /* i18n */ 'secretSource.databaseActive',
    DATABASE_INACTIVE: /* i18n */ 'secretSource.databaseInactive',
} as const;
