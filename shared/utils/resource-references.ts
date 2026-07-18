export interface ResourceReferences {
    readonly connections: ReadonlySet<string>;
    readonly secrets: ReadonlySet<string>;
}

const CONNECTION_CODE_KEY = /connectionCode$/i;
const SECRET_CODE_KEY = /secretCode$/i;
const SECRET_CODES_KEY = /secretCodes$/i;

function addStringReference(value: unknown, target: Set<string>): void {
    if (typeof value !== 'string') {
        return;
    }
    const code = value.trim();
    if (code) {
        target.add(code);
    }
}

function addStringReferences(
    value: unknown,
    target: Set<string>,
    visited: WeakSet<object>,
): void {
    if (typeof value === 'string') {
        addStringReference(value, target);
        return;
    }
    if (Array.isArray(value)) {
        if (visited.has(value)) return;
        visited.add(value);
        for (const item of value) {
            addStringReferences(item, target, visited);
        }
        return;
    }
    if (value && typeof value === 'object') {
        if (visited.has(value)) return;
        visited.add(value);
        for (const item of Object.values(value)) {
            addStringReferences(item, target, visited);
        }
    }
}

export function collectResourceReferences(value: unknown): ResourceReferences {
    const connections = new Set<string>();
    const secrets = new Set<string>();
    const visited = new WeakSet<object>();
    const pluralSecretValues = new WeakSet<object>();

    const visit = (candidate: unknown): void => {
        if (!candidate || typeof candidate !== 'object' || visited.has(candidate)) {
            return;
        }
        visited.add(candidate);

        if (Array.isArray(candidate)) {
            for (const item of candidate) {
                visit(item);
            }
            return;
        }

        for (const [key, item] of Object.entries(candidate)) {
            if (CONNECTION_CODE_KEY.test(key)) {
                addStringReference(item, connections);
            }
            if (SECRET_CODE_KEY.test(key)) {
                addStringReference(item, secrets);
            } else if (SECRET_CODES_KEY.test(key)) {
                addStringReferences(item, secrets, pluralSecretValues);
            }
            visit(item);
        }
    };

    visit(value);
    return { connections, secrets };
}
