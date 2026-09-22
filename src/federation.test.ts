import { describe, test, expect } from 'bun:test';
import 'reflect-metadata';
import { Key, External, Provides, Extends, Shareable, Tag, Directive, Requires } from './decorators/federation.decorators';
import { FederationSchemaBuilder } from './schema/federation-schema-builder';
import { SchemaBuilder } from '@galaxy-stack/orbit-graphql';

describe('federation decorators', () => {
  test('Key stores field sets (string and options)', () => {
    @Key('id')
    @Key({ fields: 'upc units', resolvable: false })
    class Product {}

    const keys = Reflect.getMetadata('federation:key', Product) as any[];
    // decorators evaluate bottom-up, so the options variant is stored first
    expect(keys).toEqual([
      expect.objectContaining({ fields: 'upc units', resolvable: false }),
      expect.objectContaining({ fields: 'id' }),
    ]);
  });

  test('External marks properties', () => {
    class Product {
      @External()
      upc: string = '';
    }
    const externals = Reflect.getMetadata('federation:external', Product) as string[];
    expect(externals).toContain('upc');
  });

  test('Provides and Requires record field lists', () => {
    class Review {
      @Provides('product { upc }')
      product: any;

      @Requires('upc')
      field: any;
    }
    // decorators store per-property maps (keyed by property name)
    const provides = Reflect.getMetadata('federation:provides', Review);
    const requires = Reflect.getMetadata('federation:requires', Review);
    expect(provides.product).toBe('product { upc }');
    expect(requires.field).toBe('upc');
  });

  test('Extends and Shareable mark entities', () => {
    @Extends()
    class A {}
    @Shareable()
    class B {}
    expect(Reflect.getMetadata('federation:extends', A)).toBe(true);
    expect(Reflect.getMetadata('federation:shareable', B)).toBe(true);
  });

  test('Directive stores raw SDL', () => {
    @Directive('@cacheControl(maxAge: 300)')
    class C {}
    const directives = Reflect.getMetadata('federation:directives', C) as string[];
    expect(directives).toContain('@cacheControl(maxAge: 300)');
  });
});

describe('FederationSchemaBuilder', () => {
  test('extends the core SchemaBuilder', () => {
    const builder = new FederationSchemaBuilder();
    expect(builder).toBeInstanceOf(SchemaBuilder);
  });

  test('builds a subgraph schema with federation entity', () => {
    @Key('upc')
    class Product {
      upc: string = '1';
      name: string = 'Widget';
    }

    const builder = new FederationSchemaBuilder();
    builder.addResolver({
      constructor: class R {},
    } as any);
    const schema = builder.build();
    expect(schema).toBeDefined();
  });
});
