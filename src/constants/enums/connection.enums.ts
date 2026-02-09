/**
 * Connection domain enums - External service connections and authentication
 */

/**
 * Connection types for external services
 */
export const ConnectionType = {
    HTTP: "HTTP",
    S3: "S3",
    FTP: "FTP",
    SFTP: "SFTP",
    DATABASE: "DATABASE",
    CUSTOM: "CUSTOM",
} as const;
export type ConnectionType = typeof ConnectionType[keyof typeof ConnectionType];

/**
 * Authentication types
 */
export const AuthType = {
    NONE: "NONE",
    BASIC: "BASIC",
    BEARER: "BEARER",
    API_KEY: "API_KEY",
    OAUTH2: "OAUTH2",
    HMAC: "HMAC",
    JWT: "JWT",
} as const;
export type AuthType = typeof AuthType[keyof typeof AuthType];

/**
 * Secret provider types
 */
export const SecretProvider = {
    INLINE: "INLINE",
    ENV: "ENV",
    EXTERNAL: "EXTERNAL",
} as const;
export type SecretProvider = typeof SecretProvider[keyof typeof SecretProvider];

