import { describe, expect, it } from 'vitest';
import {
    getChildElementNames,
    getRootElement,
    parseXml,
    parseXmlElement,
} from './xml.parser';

describe('parseXml', () => {
    it('preserves nested elements, repeated elements, attributes, and decoded entities', () => {
        const result = parseXml(`
            <catalog>
                <product data-id="12">
                    <name>A &amp; B</name>
                    <category>one</category>
                    <category>two</category>
                    <details>
                        <color>red</color>
                        <enabled>true</enabled>
                    </details>
                </product>
            </catalog>
        `, {
            recordPath: 'catalog.product',
            attributePrefix: '@',
        });

        expect(result).toMatchObject({
            success: true,
            totalRows: 1,
            records: [{
                '@data-id': 12,
                name: 'A & B',
                category: ['one', 'two'],
                details: {
                    color: 'red',
                    enabled: true,
                },
            }],
        });
        expect(result.fields).toHaveLength(4);
        expect(result.fields).toEqual(expect.arrayContaining([
            '@data-id',
            'name',
            'category',
            'details',
        ]));
    });

    it('uses the complete hierarchical record path instead of matching only its final tag', () => {
        const result = parseXml(`
            <root>
                <catalog>
                    <product><sku>CATALOG-1</sku></product>
                </catalog>
                <archive>
                    <product><sku>ARCHIVE-1</sku></product>
                </archive>
            </root>
        `, {
            recordPath: 'root.catalog.product',
        });

        expect(result.records).toEqual([{ sku: 'CATALOG-1' }]);
    });

    it('supports descendant paths, fallback alternatives, and namespaced elements', () => {
        const result = parseXml(`
            <env:envelope xmlns:env="urn:envelope" xmlns:p="urn:product">
                <env:payload>
                    <p:catalog>
                        <p:product p:id="SKU-1">
                            <p:name>Widget</p:name>
                        </p:product>
                    </p:catalog>
                </env:payload>
            </env:envelope>
        `, {
            recordPath: 'missing.path|//catalog/product',
            attributePrefix: '@',
        });

        expect(result.records).toEqual([{
            '@p:id': 'SKU-1',
            'p:name': 'Widget',
        }]);
    });

    it('uses default record tags for namespaced records', () => {
        const result = parseXml(`
            <p:catalog xmlns:p="urn:product">
                <p:product><p:sku>SKU-1</p:sku></p:product>
                <p:product><p:sku>SKU-2</p:sku></p:product>
            </p:catalog>
        `);

        expect(result.records).toEqual([
            { 'p:sku': 'SKU-1' },
            { 'p:sku': 'SKU-2' },
        ]);
    });

    it('returns a failed result for malformed XML', () => {
        const result = parseXml('<catalog><product></catalog>');

        expect(result.success).toBe(false);
        expect(result.records).toEqual([]);
        expect(result.errors).toHaveLength(1);
    });

    it('warns when a complete record path does not match', () => {
        const result = parseXml(
            '<root><archive><product><sku>SKU-1</sku></product></archive></root>',
            { recordPath: 'root.catalog.product' },
        );

        expect(result).toMatchObject({
            success: true,
            records: [],
            totalRows: 0,
            warnings: ['No records found matching path: "root.catalog.product"'],
        });
    });
});

describe('XML element inspection', () => {
    it('parses a single element with custom attribute prefixes and repeated children', () => {
        expect(parseXmlElement(`
            <product data-id="7">
                <tag>first</tag>
                <tag>second</tag>
            </product>
        `, 'attr:')).toEqual({
            'attr:data-id': 7,
            tag: ['first', 'second'],
        });
    });

    it('reports namespaced root and direct child element names', () => {
        const xml = `
            <p:catalog xmlns:p="urn:product">
                <p:product><p:sku>SKU-1</p:sku></p:product>
                <p:metadata />
            </p:catalog>
        `;

        expect(getRootElement(xml)).toBe('p:catalog');
        expect(getChildElementNames(xml)).toEqual([
            'p:product',
            'p:metadata',
        ]);
    });
});
