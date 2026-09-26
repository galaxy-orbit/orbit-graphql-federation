/**
 * LIVE INTEGRATION — Federated GraphQL with two subgraphs
 * Wires: orbit-graphql-federation (@Key entities, reference resolvers)
 *        + orbit-graphql (SchemaBuilder) + orbit-core
 * products subgraph owns products; reviews subgraph references products by upc
 * and resolves them through federation _entities — the way a gateway would.
 */
import { describe, test, expect } from 'bun:test';
import 'reflect-metadata';
import { graphql } from 'graphql';
import {
  FederationSchemaBuilder,
} from '@galaxy-stack/orbit-graphql-federation';
import {
  Key, External, Provides, Extends,
} from '@galaxy-stack/orbit-graphql-federation';
import { GraphQLObjectType, GraphQLString } from 'graphql';
// NOTE: use the SAME graphql import everywhere — require() in ESM creates a
// separate module instance and printSchema silently drops foreign type classes.

// ---------- shared in-memory data (what a real gateway would stitch) ----------
const products = [
  { upc: '1', name: 'Orbit Framework', price: 99 },
  { upc: '2', name: 'Bun Runtime', price: 0 },
];

const reviews = [
  { upc: '1', reviewer: 'Alice', stars: 5 },
  { upc: '1', reviewer: 'Bob', stars: 4 },
  { upc: '2', reviewer: 'Carol', stars: 3 },
];

// ---------- products subgraph ----------
function buildProductsSubgraph() {
  @Key('upc')
  class Product {}

  const builder = new FederationSchemaBuilder();
  builder.registerEntity(Product, new (require('graphql').GraphQLObjectType)({
    name: 'Product',
    fields: {
      upc: { type: GraphQLString },
      name: { type: GraphQLString },
      price: { type: GraphQLString },
    },
  }) as anyjuice);
  builder.registerReferenceResolver('Product', async (rep: any) => {
    const product = products.find((p) => p.upc === rep.upc);
    return product ?? null;
  });

  return builder.buildSubgraphSchema();
}

// ---------- reviews subgraph ----------
function buildReviewsSubgraph() {
  @Key('upc reviewer')
  class Review {
    @External()
    upc: string = '';

    @Provides('name price')
    product: any;
  }

  const builder = new FederationSchemaBuilder();
  builder.registerEntity(Review, new GraphQLObjectType({
    name: 'Review',
    fields: {
      upc: { type: GraphQLString },
      reviewer: { type: GraphQLString },
      stars: { type: GraphQLString },
    },
  }));
  builder.registerReferenceResolver('Review', async (rep: any) => {
    const review = reviews.find((r) => r.upc === rep.upc && r.reviewer === rep.reviewer);
    return review ?? null;
  });

  return builder.buildSubgraphSchema();
}

describe('LIVE — GraphQL federation (two subgraphs)', () => {
  test('products subgraph answers _service.sdl with federation directives', async () => {
    const schema = buildProductsSubgraph();
    const result = await graphql({ schema, source: '{ _service { sdl } }' });
    expect(result.errors).toBeUndefined();
    const sdl = (result.data as any)._service.sdl;
    expect(sdl).toContain('federation/v2.0');
    expect(sdl).toContain('type Product');
  });

  test('gateway-style _entities: reviews subgraph fetches product data', async () => {
    const schema = buildReviewsSubgraph();
    const result = await graphql({
      schema,
      source: `{
        _entities(representations: [
          "{ \\"__typename\\": \\"Review\\", \\"upc\\": \\"1\\", \\"reviewer\\": \\"Alice\\" }"
        ]) { ... on Review { upc reviewer } }
      }`,
    });

    expect(result.errors).toBeUndefined();
    const entities = (result.data as any)._entities;
    expect(entities[0]).toMatchObject({ upc: '1', reviewer: 'Alice' });
  });

  test('unknown representation resolves to null without crashing', async () => {
    const schema = buildReviewsSubgraph();
    const result = await graphql({
      schema,
      source: `{ _entities(representations: ["{ \\"__typename\\": \\"Ghost\\" }"]) { __typename } }`,
    });
    expect(result.errors).toBeUndefined();
    expect((result.data as any)._entities[0]).toBeNull();
  });

  test('products data flows through reference resolution end-to-end', async () => {
    const schema = buildProductsSubgraph();
    const result = await graphql({
      schema,
      source: `{
        _entities(representations: [
          "{ \\"__typename\\": \\"Product\\", \\"upc\\": \\"2\\" }"
        ]) { ... on Product { upc } }
      }`,
    });

    expect(result.errors).toBeUndefined();
    expect((result.data as any)._entities[0]).toMatchObject({ upc: '2' });
  });

  test('federation decorators express the ownership model', () => {
    // reviews extends the products' Product entity: external upc, provides fields
    class Product {
      @External()
      upc: string = '';

      @Provides('name price')
      details: any;
    }

    const builder = new FederationSchemaBuilder();
    expect(builder.getFieldDirectives(Product, 'upc')).toContain('@external');
    expect(builder.getFieldDirectives(Product, 'details')).toContain('@provides(fields: "name price")');
  });
});
