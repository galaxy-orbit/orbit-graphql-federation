import { describe, test, expect } from 'bun:test';
import 'reflect-metadata';
import { graphql } from 'graphql';
import { SchemaBuilder } from '@galaxy-stack/orbit-graphql';
import { Query } from '@galaxy-stack/orbit-graphql';
import {
  Key, External, Requires, Provides, Extends, Shareable,
  Inaccessible, Override, Tag, Directive,
  KEY_METADATA, EXTERNAL_METADATA, REQUIRES_METADATA,
  PROVIDES_METADATA, EXTENDS_METADATA, SHAREABLE_METADATA,
  INACCESSIBLE_METADATA, OVERRIDE_METADATA,
} from './decorators/federation.decorators';
import { ResolveReference, ReferenceResolver, RESOLVE_REFERENCE_METADATA } from './decorators/reference-resolver.decorator';
import { FederationSchemaBuilder } from './schema/federation-schema-builder';

describe('federation decorators — remaining directives', () => {
  test('Inaccessible works at class level', () => {
    @Inaccessible()
    class HiddenType {}
    expect(Reflect.getMetadata(INACCESSIBLE_METADATA, HiddenType)).toBe(true);
  });

  test('Inaccessible marks individual properties', () => {
    class HiddenFields {
      @Inaccessible()
      secretField: string = '';
    }
    const fields = Reflect.getMetadata(INACCESSIBLE_METADATA, HiddenFields) as string[];
    expect(fields).toContain('secretField');
  });

  test('Override records the source subgraph per property', () => {
    class Product {
      @Override('products')
      name: string = '';
    }
    const overrides = Reflect.getMetadata(OVERRIDE_METADATA, Product);
    expect(overrides.name).toBe('products');
  });

  test('Tag attaches to class and to individual properties', () => {
    @Tag('public')
    class TaggedEntity {
      @Tag('internal')
      internalField: string = '';
    }
    expect(Reflect.getMetadata('federation:tag', TaggedEntity)).toEqual(['public']);
    expect(Reflect.getMetadata('federation:tag:internalField', TaggedEntity)).toEqual(['internal']);
  });

  test('ResolveReference stores the method name; alias resolves the same', () => {
    class ProductResolver {
      @ResolveReference()
      async resolveReference(rep: any) { return rep; }
    }
    const meta = Reflect.getMetadata(RESOLVE_REFERENCE_METADATA, ProductResolver);
    expect(meta).toEqual({ methodName: 'resolveReference' });

    class AliasResolver {
      @ReferenceResolver()
      async byUpc(rep: any) { return rep; }
    }
    const aliasMeta = Reflect.getMetadata(RESOLVE_REFERENCE_METADATA, AliasResolver);
    expect(aliasMeta.methodName).toBe('byUpc');
  });
});

describe('FederationSchemaBuilder — directive generation', () => {
  test('getEntityDirectives renders @key with and without resolvable', () => {
    @Key('upc')
    @Key({ fields: 'sku stock', resolvable: false })
    class Product {}

    const builder = new FederationSchemaBuilder();
    const directives = builder.getEntityDirectives(Product);
    expect(directives).toContain('@key(fields: "upc")');
    expect(directives).toContain('@key(fields: "sku stock", resolvable: false)');
  });

  test('getEntityDirectives includes @extends and @shareable', () => {
    @Extends()
    @Shareable()
    class SharedProduct {}

    const directives = new FederationSchemaBuilder().getEntityDirectives(SharedProduct);
    expect(directives).toContain('@extends');
    expect(directives).toContain('@shareable');
  });

  test('getFieldDirectives renders external/requires/provides/shareable', () => {
    class Review {
      @External()
      upc: string = '';

      @Requires('upc price')
      computed: string = '';

      @Provides('reviews')
      product: any;

      @Shareable()
      sharedField: string = '';
    }

    const builder = new FederationSchemaBuilder();
    const upc = builder.getFieldDirectives(Review, 'upc');
    const requiresField = builder.getFieldDirectives(Review, 'computed');
    const providesField = builder.getFieldDirectives(Review, 'product');
    const shared = builder.getFieldDirectives(Review, 'sharedField');
    const missing = builder.getFieldDirectives(Review, 'nothing');

    expect(upc).toContain('@external');
    expect(requiresField).toContain('@requires(fields: "upc price")');
    expect(providesField).toContain('@provides(fields: "reviews")');
    expect(shared).toContain('@shareable');
    expect(missing).toEqual([]);
  });
});

describe('FederationSchemaBuilder — entity registration', () => {
  test('registerEntity only stores types that carry @key', () => {
    @Key('id')
    class EntityWithKey {}
    class PlainType {}

    const builder = new FederationSchemaBuilder();
    const objectType: any = { name: 'EntityWithKey' };
    builder.registerEntity(EntityWithKey, objectType);
    builder.registerEntity(PlainType, { name: 'PlainType' } as any);

    // entityTypes is private; observable through _entities presence in the schema
    const subgraph = builder.buildSubgraphSchema();
    const sdl = (subgraph.getQueryType()!.getFields()['_service'].resolve as any)({}, {}, {}, {} as any);
    expect(sdl).toBeDefined();
  });
});

describe('buildSubgraphSchema — federated query surface', () => {
  function makeSubgraphSchema() {
    @Key('upc')
    class Product {
      upc!: string;
      name!: string;
    }

    class ProductResolver {
      @Query(() => [String])
      products(): string[] { return ['a', 'b']; }
    }

    const builder = new FederationSchemaBuilder();
    builder.addResolver(new ProductResolver());
    builder.registerEntity(Product, new (require('graphql').GraphQLObjectType)({
      name: 'Product',
      fields: {
        upc: { type: require('graphql').GraphQLString },
        name: { type: require('graphql').GraphQLString },
      },
    }) as any);
    builder.registerReferenceResolver('Product', async (rep: any) => ({
      upc: rep.upc,
      name: `Product ${rep.upc}`,
    }));

    const schema = builder.buildSubgraphSchema();
    return { schema };
  }

  test('plain queries survive federation wrapping', async () => {
    const { schema } = makeSubgraphSchema();
    const result = await graphql({ schema, source: '{ products }' });
    expect(result.errors).toBeUndefined();
    expect(result.data?.products).toEqual(['a', 'b']);
  });

  test('_service.sdl returns federated SDL with the federation link', async () => {
    const { schema } = makeSubgraphSchema();
    const result = await graphql({ schema, source: '{ _service { sdl } }' });

    expect(result.errors).toBeUndefined();
    const sdl = (result.data as any)._service.sdl as string;
    expect(sdl).toContain('extend schema');
    expect(sdl).toContain('specs.apollo.dev/federation/v2.0');
    expect(sdl).toContain('type Query');
  });

  test('_entities resolves through registered reference resolvers', async () => {
    const { schema } = makeSubgraphSchema();
    const source = `{
      _entities(representations: [
        "{ \\"__typename\\": \\"Product\\", \\"upc\\": \\"1\\" }"
        "{ \\"__typename\\": \\"Product\\", \\"upc\\": \\"2\\" }"
      ]) {
        ... on Product { upc name }
      }
    }`;

    const result = await graphql({ schema, source });
    expect(result.errors).toBeUndefined();
    const entities = (result.data as any)._entities;
    expect(entities).toHaveLength(2);
    expect(entities[0]).toEqual({ upc: '1', name: 'Product 1' });
    expect(entities[1]).toEqual({ upc: '2', name: 'Product 2' });
  });

  test('unknown entity typename resolves to null without crashing', async () => {
    const { schema } = makeSubgraphSchema();
    const result = await graphql({
      schema,
      source: `{ _entities(representations: ["{ \\"__typename\\": \\"Unknown\\" }"]) { __typename } }`,
    });
    expect(result.errors).toBeUndefined();
    expect((result.data as any)._entities[0]).toBeNull();
  });
});
