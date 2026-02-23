#!/usr/bin/env ts-node
/**
 * Generates shared/constants/enums.ts from backend enums.
 * Runs automatically via `npm run codegen`.
 */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

const ENUM_MAPPING: Record<string, string> = {
    RunStatus: 'RUN_STATUS',
    StepType: 'STEP_TYPE',
    TriggerType: 'TRIGGER_TYPE',
    LoadStrategy: 'LOAD_STRATEGY',
    ConflictStrategy: 'CONFLICT_STRATEGY',
    ValidationMode: 'VALIDATION_MODE',
    HookStage: 'HOOK_STAGE',
    FileFormat: 'FILE_FORMAT',
    CheckpointStrategy: 'CHECKPOINT_STRATEGY',
    QueueType: 'QUEUE_TYPE',
    AckMode: 'ACK_MODE',
};

const PRESERVE_CUSTOM = [
    'DESTINATION_TYPE',
    'SOURCE_TYPE',
    'EXPORT_FORMAT',
    'CLEANUP_STRATEGY',
    'COMPRESSION_TYPE',
];

interface EnumInfo {
    name: string;
    members: Array<{ name: string; value: string }>;
    comment?: string;
}

function parseBackendEnums(filePath: string): EnumInfo[] {
    const sourceCode = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true
    );

    const enums: EnumInfo[] = [];

    function visit(node: ts.Node) {
        if (ts.isEnumDeclaration(node) && node.name) {
            const enumName = node.name.text;

            if (!ENUM_MAPPING[enumName]) {
                return;
            }

            const members: Array<{ name: string; value: string }> = [];

            node.members.forEach(member => {
                if (ts.isEnumMember(member) && ts.isIdentifier(member.name)) {
                    const memberName = member.name.text;
                    let value = memberName;

                    if (member.initializer && ts.isStringLiteral(member.initializer)) {
                        value = member.initializer.text;
                    }

                    members.push({ name: memberName, value });
                }
            });

            const fullText = sourceFile.getFullText();
            const nodeStart = node.getFullStart();
            const nodePos = node.getStart(sourceFile);
            const leadingText = fullText.substring(nodeStart, nodePos);
            const commentMatch = leadingText.match(/\/\*\*[\s\S]*?\*\//);

            enums.push({
                name: enumName,
                members,
                comment: commentMatch ? commentMatch[0] : undefined,
            });
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return enums;
}

function generateConstObject(info: EnumInfo): string {
    const constName = ENUM_MAPPING[info.name];
    const lines: string[] = [];

    if (info.comment) {
        const cleanComment = info.comment
            .replace(/\/\*\*\s*/, '/**\n * ')
            .replace(/\s*\*\//, '\n */');
        lines.push(cleanComment);
    } else {
        lines.push(`/** ${info.name} */`);
    }

    lines.push(`export const ${constName} = {`);

    info.members.forEach(member => {
        lines.push(`    ${member.name}: '${member.value}',`);
    });

    lines.push(`} as const;`);

    return lines.join('\n');
}

async function extractCustomConstObjects(filePath: string): Promise<string[]> {
    try {
        const content = await fsPromises.readFile(filePath, 'utf8');
        const customs: string[] = [];
        const lines = content.split('\n');

        for (const constName of PRESERVE_CUSTOM) {
            let inTarget = false;
            let depth = 0;
            let currentConst: string[] = [];
            let comment: string[] = [];
            let inComment = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                if (!inTarget && line.trim().startsWith('/**')) {
                    inComment = true;
                    comment = [line];
                    continue;
                }

                if (inComment) {
                    comment.push(line);
                    if (line.trim().includes('*/')) {
                        inComment = false;
                    }
                    continue;
                }

                if (!inTarget && line.includes(`export const ${constName}`)) {
                    inTarget = true;
                    currentConst = [...comment, line];
                    depth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;

                    if (line.includes('} as const;')) {
                        customs.push(currentConst.join('\n'));
                        break;
                    }
                    continue;
                }

                if (inTarget) {
                    currentConst.push(line);
                    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;

                    if (depth === 0 && line.includes('} as const;')) {
                        customs.push(currentConst.join('\n'));
                        break;
                    }
                }
            }

            comment = [];
        }

        return customs;
    } catch (error) {
        console.warn('Could not read existing shared enums file, skipping custom preservation');
        return [];
    }
}

async function generateSharedEnums() {
    const rootDir = path.resolve(__dirname, '..');
    const backendEnumsPath = path.join(rootDir, 'src/constants/enums.ts');
    const sharedEnumsPath = path.join(rootDir, 'shared/constants/enums.ts');

    console.log('🔍 Parsing backend enums from:', backendEnumsPath);
    const enums = parseBackendEnums(backendEnumsPath);
    console.log(`✅ Found ${enums.length} enums to generate`);

    console.log('🔍 Extracting custom const objects...');
    const customObjects = await extractCustomConstObjects(sharedEnumsPath);
    console.log(`✅ Preserved ${customObjects.length} custom const objects`);

    const header = `/**
 * AUTO-GENERATED - DO NOT EDIT
 * Run: npm run codegen
 */

`;

    const generatedConsts = enums.map(generateConstObject).join('\n\n');

    const output = [
        header,
        generatedConsts,
        '',
        customObjects.join('\n\n'),
    ].join('\n');

    console.log('📝 Writing to:', sharedEnumsPath);
    await fsPromises.writeFile(sharedEnumsPath, output, 'utf8');

    console.log('✨ Successfully generated shared/constants/enums.ts');
    console.log(`   - ${enums.length} auto-generated enums`);
    console.log(`   - ${customObjects.length} preserved custom objects`);
}

// Run the generator
generateSharedEnums().catch(error => {
    console.error('❌ Error generating shared enums:', error);
    process.exit(1);
});
