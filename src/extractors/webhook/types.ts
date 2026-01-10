import { ExtractorConfig } from '../../types/index';

export interface WebhookExtractorConfig extends ExtractorConfig {
    /** Field containing records array in webhook payload */
    dataPath?: string;

    /** Field to use as idempotency key */
    idempotencyKeyField?: string;

    /** Validate payload signature */
    validateSignature?: boolean;

    /** Secret code for signature validation */
    signatureSecretCode?: string;

    /** Signature header name */
    signatureHeader?: string;

    /** Signature algorithm */
    signatureAlgorithm?: 'sha256' | 'sha1' | 'md5';

    /** Expected content type */
    contentType?: 'json' | 'xml' | 'form';

    /** Wrap single object in array */
    wrapSingleRecord?: boolean;
}
