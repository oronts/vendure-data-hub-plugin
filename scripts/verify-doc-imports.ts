import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { buildSchema, DocumentNode, GraphQLSchema, Kind, parse, validate } from 'graphql';

const packageName = '@oronts/vendure-data-hub-plugin';
const root = resolve(__dirname, '..');
const entryPoints = new Map<string, string>([
    [packageName, resolve(root, 'src/index.ts')],
    [`${packageName}/sdk`, resolve(root, 'src/sdk/index.ts')],
    [`${packageName}/shared`, resolve(root, 'shared/index.ts')],
    [`${packageName}/connectors`, resolve(root, 'connectors/index.ts')],
    [`${packageName}/connectors/pimcore`, resolve(root, 'connectors/pimcore/index.ts')],
]);
const markdownRoots = [resolve(root, 'docs'), resolve(root, 'connectors')];
const rootMarkdown = [
    'README.md',
    'CONFIGURATION.md',
    'SECURITY.md',
    'CHANGELOG.md',
    'CONTRIBUTING.md',
].map(file => resolve(root, file));
const codeBlockPattern = /^```(?:typescript|ts|tsx)\s*\n([\s\S]*?)^```/gm;
const graphQlBlockPattern = /^```graphql\s*\n([\s\S]*?)^```/gm;
const localLinkPattern = /\]\((<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g;
const dataHubOperationPattern = /^(?:dataHub|createDataHub|updateDataHub|deleteDataHub|publishDataHub|submitDataHub|approveDataHub|rejectDataHub|archiveDataHub|startDataHub|cancelDataHub|retryDataHub|markDataHub|revertDataHub|runDataHub|validateDataHub|previewDataHub|simulateDataHub)/;

async function collectMarkdown(directory: string): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectMarkdown(path));
        } else if (extname(entry.name) === '.md') {
            files.push(path);
        }
    }
    return files;
}

function loadCompilerOptions(): ts.CompilerOptions {
    const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
    if (!configPath) throw new Error('tsconfig.json was not found');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error) {
        throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
    }
    return ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
}

function readExports(): Map<string, Set<string>> {
    const program = ts.createProgram([...entryPoints.values()], loadCompilerOptions());
    const checker = program.getTypeChecker();
    const exports = new Map<string, Set<string>>();
    for (const [specifier, entryPoint] of entryPoints) {
        const source = program.getSourceFile(entryPoint);
        const symbol = source ? checker.getSymbolAtLocation(source) : undefined;
        if (!source || !symbol) throw new Error(`Cannot inspect public entry point ${entryPoint}`);
        exports.set(specifier, new Set(checker.getExportsOfModule(symbol).map(item => item.name)));
    }
    return exports;
}

interface ImportFailure {
    file: string;
    line: number;
    specifier: string;
    symbol: string;
}

interface GraphQlFailure {
    file: string;
    line: number;
    message: string;
}

interface LinkFailure {
    file: string;
    line: number;
    target: string;
}

async function verifyLocalLinks(file: string): Promise<LinkFailure[]> {
    const markdown = await readFile(file, 'utf8');
    const failures: LinkFailure[] = [];
    for (const match of markdown.matchAll(localLinkPattern)) {
        const rawTarget = match[1].replace(/^<|>$/g, '');
        if (/^(?:[a-z]+:|#|\/)/i.test(rawTarget) || rawTarget.includes('{{')) continue;
        const relativeTarget = decodeURIComponent(rawTarget.split(/[?#]/, 1)[0]);
        if (!relativeTarget) continue;
        try {
            await access(resolve(dirname(file), relativeTarget));
        } catch {
            failures.push({
                file: relative(root, file),
                line: markdown.slice(0, match.index ?? 0).split('\n').length,
                target: rawTarget,
            });
        }
    }
    return failures;
}

async function verifyMarkdownFile(
    file: string,
    publicExports: Map<string, Set<string>>,
): Promise<ImportFailure[]> {
    const markdown = await readFile(file, 'utf8');
    const failures: ImportFailure[] = [];
    for (const match of markdown.matchAll(codeBlockPattern)) {
        const sourceText = match[1];
        const source = ts.createSourceFile('documentation.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const blockStartLine = markdown.slice(0, (match.index ?? 0) + match[0].indexOf(sourceText)).split('\n').length;
        for (const statement of source.statements) {
            if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
            const specifier = statement.moduleSpecifier.text;
            const knownExports = publicExports.get(specifier);
            if (!knownExports) continue;
            const namedBindings = statement.importClause?.namedBindings;
            if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
            for (const imported of namedBindings.elements) {
                const importedName = imported.propertyName?.text ?? imported.name.text;
                if (knownExports.has(importedName)) continue;
                const line = source.getLineAndCharacterOfPosition(imported.getStart()).line;
                failures.push({
                    file: relative(root, file),
                    line: blockStartLine + line,
                    specifier,
                    symbol: importedName,
                });
            }
        }
    }
    return failures;
}

async function verifyGraphQlFile(file: string, schema: GraphQLSchema): Promise<GraphQlFailure[]> {
    const markdown = await readFile(file, 'utf8');
    const failures: GraphQlFailure[] = [];
    for (const match of markdown.matchAll(graphQlBlockPattern)) {
        const sourceText = match[1];
        const blockStartLine = markdown.slice(0, (match.index ?? 0) + match[0].indexOf(sourceText)).split('\n').length;
        let document: DocumentNode;
        try {
            document = parse(sourceText);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push({ file: relative(root, file), line: blockStartLine, message });
            continue;
        }
        const operations = document.definitions.filter(definition => definition.kind === Kind.OPERATION_DEFINITION);
        const targetsDataHubApi = operations.some(operation =>
            operation.selectionSet.selections.some(selection =>
                selection.kind === Kind.FIELD && dataHubOperationPattern.test(selection.name.value),
            ),
        );
        if (!targetsDataHubApi) continue;
        for (const error of validate(schema, document)) {
            failures.push({
                file: relative(root, file),
                line: blockStartLine + (error.locations?.[0]?.line ?? 1) - 1,
                message: error.message,
            });
        }
    }
    return failures;
}

async function main(): Promise<void> {
    const markdownFiles = [
        ...rootMarkdown,
        ...(await Promise.all(markdownRoots.map(collectMarkdown))).flat(),
    ];
    const publicExports = readExports();
    const graphQlSchema = buildSchema(await readFile(resolve(root, 'schema.graphql'), 'utf8'));
    const failures = (await Promise.all(
        markdownFiles.map(file => verifyMarkdownFile(file, publicExports)),
    )).flat();
    const graphQlFailures = (await Promise.all(
        markdownFiles.map(file => verifyGraphQlFile(file, graphQlSchema)),
    )).flat();
    const linkFailures = (await Promise.all(
        markdownFiles.map(file => verifyLocalLinks(file)),
    )).flat();
    if (failures.length > 0 || graphQlFailures.length > 0 || linkFailures.length > 0) {
        for (const failure of failures) {
            process.stderr.write(
                `${failure.file}:${failure.line} imports missing ${failure.symbol} from ${failure.specifier}\n`,
            );
        }
        for (const failure of graphQlFailures) {
            process.stderr.write(`${failure.file}:${failure.line} has invalid GraphQL: ${failure.message}\n`);
        }
        for (const failure of linkFailures) {
            process.stderr.write(`${failure.file}:${failure.line} links to missing ${failure.target}\n`);
        }
        process.exitCode = 1;
        return;
    }
    process.stdout.write(`Verified public imports and Data Hub GraphQL in ${markdownFiles.length} Markdown files\n`);
}

void main();
