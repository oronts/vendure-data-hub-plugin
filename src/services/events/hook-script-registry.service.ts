import { Injectable } from '@nestjs/common';
import { CODE_PATTERN } from '../../../shared';
import type { ScriptFunction } from '../../types';

@Injectable()
export class HookScriptRegistryService {
    private readonly scripts = new Map<string, ScriptFunction>();

    register(name: string, fn: ScriptFunction): boolean {
        if (name.trim() !== name || !CODE_PATTERN.test(name)) {
            throw new Error(
                'Hook script names must start with a letter and contain only letters, numbers, hyphens, and underscores',
            );
        }
        if (typeof fn !== 'function') {
            throw new Error(`Hook script "${name}" must be a function`);
        }
        const replaced = this.scripts.has(name);
        this.scripts.set(name, fn);
        return replaced;
    }

    has(name: string): boolean {
        return this.scripts.has(name);
    }

    get(name: string): ScriptFunction | undefined {
        return this.scripts.get(name);
    }

    names(): string[] {
        return [...this.scripts.keys()].sort();
    }

    clear(): void {
        this.scripts.clear();
    }
}
