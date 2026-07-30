import {
    CodeSecurityConfig,
    DANGEROUS_PATTERNS,
    DEFAULT_CODE_SECURITY_CONFIG,
    DISALLOWED_KEYWORDS_PATTERN,
    PROTOTYPE_POLLUTION_PATTERNS,
    SAFE_EXPRESSION_PATTERN,
    SCRIPT_DISALLOWED_KEYWORDS_PATTERN,
} from './code-security-patterns';

export function validateUserCode(
    code: string,
    config: Partial<CodeSecurityConfig> = {},
): void {
    const mergedConfig = { ...DEFAULT_CODE_SECURITY_CONFIG, ...config };

    if (!code || typeof code !== 'string') {
        throw new Error('Code must be a non-empty string');
    }
    if (code.length > mergedConfig.maxCodeLength) {
        throw new Error(
            `Code exceeds maximum length of ${mergedConfig.maxCodeLength} characters`,
        );
    }

    const normalizedCode = code.replace(/\s+/g, ' ').trim();
    checkDangerousPatterns(normalizedCode);
    checkDisallowedKeywords(normalizedCode);
    checkPrototypePollution(normalizedCode);
    checkExpressionComplexity(normalizedCode, mergedConfig);
}

export function validateScriptBlock(
    code: string,
    config: Partial<CodeSecurityConfig> = {},
): void {
    const mergedConfig = { ...DEFAULT_CODE_SECURITY_CONFIG, ...config };

    if (!code || typeof code !== 'string') {
        throw new Error('Code must be a non-empty string');
    }
    if (code.length > mergedConfig.maxCodeLength) {
        throw new Error(
            `Code exceeds maximum length of ${mergedConfig.maxCodeLength} characters`,
        );
    }

    const codeWithoutComments = code
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();
    const normalizedCode = codeWithoutComments.replace(/\s+/g, ' ').trim();

    checkScriptDangerousPatterns(normalizedCode);
    checkScriptDisallowedKeywords(normalizedCode);
    checkPrototypePollution(normalizedCode);
}

export function validateConditionExpression(
    condition: string,
    config: Partial<CodeSecurityConfig> = {},
): void {
    const mergedConfig = { ...DEFAULT_CODE_SECURITY_CONFIG, ...config };

    if (!condition || typeof condition !== 'string') {
        throw new Error('Condition must be a non-empty string');
    }
    if (condition.length > mergedConfig.maxConditionLength) {
        throw new Error(
            `Condition exceeds maximum length of ${mergedConfig.maxConditionLength} characters`,
        );
    }

    validateUserCode(condition, {
        ...config,
        maxCodeLength: mergedConfig.maxConditionLength,
    });

    if (!SAFE_EXPRESSION_PATTERN.test(condition)) {
        throw new Error('Condition contains invalid characters');
    }
}

function checkDangerousPatterns(code: string): void {
    const patterns = DANGEROUS_PATTERNS;

    if (patterns.STATEMENT_PATTERNS.test(code)) {
        throw new Error(
            'Code contains disallowed patterns (semicolons, braces, backticks, or template literals)',
        );
    }
    if (patterns.COMMENT_PATTERNS.test(code)) {
        throw new Error('Code contains disallowed comment syntax');
    }
    checkSharedDangerousPatterns(code);
}

function checkScriptDangerousPatterns(code: string): void {
    checkSharedDangerousPatterns(code);
}

function checkSharedDangerousPatterns(code: string): void {
    const patterns = DANGEROUS_PATTERNS;
    const checks = [
        [patterns.ESCAPE_SEQUENCES, 'Code contains disallowed escape sequences'],
        [patterns.UNICODE_ESCAPES, 'Code contains disallowed unicode characters'],
        [patterns.OCTAL_ESCAPES, 'Code contains disallowed octal escape sequences'],
        [patterns.HTML_ENTITIES, 'Code contains disallowed HTML entities'],
        [patterns.BASE64_PATTERNS, 'Code contains disallowed base64 functions'],
        [patterns.STRING_CONCAT_TRICKS, 'Code contains disallowed string concatenation patterns'],
        [patterns.COMPUTED_PROPERTY_ACCESS, 'Code contains disallowed computed property access'],
    ] as const;

    for (const [pattern, message] of checks) {
        if (pattern.test(code)) {
            throw new Error(message);
        }
    }
}

function checkDisallowedKeywords(code: string): void {
    const match = code.match(DISALLOWED_KEYWORDS_PATTERN);
    if (match) {
        throw new Error(`Code contains disallowed keyword: ${match[1] ?? 'unknown'}`);
    }
}

function checkScriptDisallowedKeywords(code: string): void {
    for (const match of code.matchAll(SCRIPT_DISALLOWED_KEYWORDS_PATTERN)) {
        const keyword = match[1];
        const matchEnd = (match.index ?? 0) + match[0].length;
        const remainder = code.slice(matchEnd);

        if (keyword === 'arguments' && /^\s*:/.test(remainder)) {
            continue;
        }
        throw new Error(`Code contains disallowed keyword: ${keyword}`);
    }
}

function checkPrototypePollution(code: string): void {
    for (const pattern of PROTOTYPE_POLLUTION_PATTERNS) {
        if (pattern.test(code)) {
            throw new Error('Code contains potential prototype pollution pattern');
        }
    }
}

function checkExpressionComplexity(
    code: string,
    config: CodeSecurityConfig,
): void {
    let maxDepth = 0;
    let currentDepth = 0;
    for (const char of code) {
        if (char === '(' || char === '[') {
            currentDepth++;
            maxDepth = Math.max(maxDepth, currentDepth);
        } else if (char === ')' || char === ']') {
            currentDepth--;
        }
    }

    const operatorCount = code.match(/[+\-*/%&|!?:<>=]/g)?.length ?? 0;
    const complexityScore = maxDepth * 2 + operatorCount;
    if (complexityScore > config.maxExpressionComplexity) {
        throw new Error(
            `Expression complexity (${complexityScore}) exceeds maximum allowed (${config.maxExpressionComplexity})`,
        );
    }

    const propertyAccessCount = code.match(/\./g)?.length ?? 0;
    if (propertyAccessCount > config.maxPropertyAccessDepth) {
        throw new Error(
            `Property access depth (${propertyAccessCount}) exceeds maximum allowed (${config.maxPropertyAccessDepth})`,
        );
    }
}
