export const DESTINATION_TRANSLATION_IDS = {
    VALIDATION_SCHEMA_UNAVAILABLE: /* i18n */ 'destinations.validation.schemaUnavailable',
    VALIDATION_FIELD_REQUIRED: /* i18n */ 'destinations.validation.fieldRequired',
    VALIDATION_SECRET_CODE: /* i18n */ 'destinations.validation.secretCode',
    VALIDATION_INTEGER: /* i18n */ 'destinations.validation.integer',
    VALIDATION_PORT_RANGE: /* i18n */ 'destinations.validation.portRange',
    VALIDATION_TIMEOUT_RANGE: /* i18n */ 'destinations.validation.timeoutRange',
    VALIDATION_HTTP_URL: /* i18n */ 'destinations.validation.httpUrl',
    VALIDATION_ID_REQUIRED: /* i18n */ 'destinations.validation.idRequired',
    VALIDATION_ID_PATTERN: /* i18n */ 'destinations.validation.idPattern',
    VALIDATION_NAME_REQUIRED: /* i18n */ 'destinations.validation.nameRequired',
    VALIDATION_SFTP_CREDENTIAL: /* i18n */ 'destinations.validation.sftpCredential',
    VALIDATION_SFTP_PASSPHRASE: /* i18n */ 'destinations.validation.sftpPassphrase',
    VALIDATION_AUTH_SECRET: /* i18n */ 'destinations.validation.authSecret',
    VALIDATION_BASIC_USERNAME: /* i18n */ 'destinations.validation.basicUsername',
    VALIDATION_USERNAME_CHOICE: /* i18n */ 'destinations.validation.usernameChoice',
    VALIDATION_NO_AUTH_CREDENTIALS: /* i18n */ 'destinations.validation.noAuthCredentials',
    VALIDATION_AUTH_USERNAME_UNSUPPORTED: /* i18n */ 'destinations.validation.authUsernameUnsupported',
    VALIDATION_AUTH_HEADER_UNSUPPORTED: /* i18n */ 'destinations.validation.authHeaderUnsupported',
    VALIDATION_SMTP_USERNAME_CHOICE: /* i18n */ 'destinations.validation.smtpUsernameChoice',
    VALIDATION_SMTP_CREDENTIAL_PAIR: /* i18n */ 'destinations.validation.smtpCredentialPair',
} as const;

export type DestinationTranslationId =
    typeof DESTINATION_TRANSLATION_IDS[keyof typeof DESTINATION_TRANSLATION_IDS];
