# @galaxy-stack/orbit-graphql-federation

[![npm version](https://img.shields.io/npm/v/@galaxy-stack/orbit-graphql-federation.svg)](https://www.npmjs.com/package/@galaxy-stack/orbit-graphql-federation)
[![docs](https://img.shields.io/badge/docs-galaxy--orbit--framework.vercel.app-blue)](https://galaxy-orbit-framework.vercel.app)

Part of the [Orbit framework](https://github.com/galaxy-orbit/packages) — a NestJS-style backend framework for [Bun](https://bun.sh).

## Installation

```bash
bun add @galaxy-stack/orbit-graphql-federation
```

# @galaxy-stack/orbit-graphql-federation

Apollo Federation (v2) subgraph support for the Orbit GraphQL package — `@key` entities, `_service`/`_entities` federation queries, and directive generation.

## Installation

```bash
bun add @galaxy-stack/orbit-graphql-federation @galaxy-stack/orbit-graphql graphql
```

## Usage

```typescript
import 'reflect-metadata';
import { FederationSchemaBuilder } from '@galaxy-stack/orbit-graphql-federation';
import { Key, External, Provides } from '@galaxy-stack/orbit-graphql-federation';
import { GraphQLObjectType, GraphQLString } from 'graphql';

@Key('upc')
class Product {}

const builder = new FederationSchemaBuilder();
builder.registerEntity(Product, new GraphQLObjectType({
  name: 'Product',
  fields: { upc: { type: GraphQLString }, name: { type: GraphQLString } },
}));
builder.registerReferenceResolver('Product', async (rep) => {
  return products.find((p) => p.upc === rep.upc) ?? null;
});

const schema = builder.buildSubgraphSchema();
// schema exposes _service { sdl } and _entities(representations)
```

## Federation directives

Class-level: `@Key(fields)`, `@Extends()`, `@Shareable()`, `@Inaccessible()`, `@Tag(name)`, `@Directive(sdl)`

Property-level: `@External()`, `@Requires(fields)`, `@Provides(fields)`, `@Shareable()`, `@Inaccessible()`, `@Override(from)`, `@Tag(name)`

Method-level: `@ResolveReference()` (alias `@ReferenceResolver()`)

## Notes

- `_entities` stamps `__typename` on resolved entities so the `_Entity` union resolves even when reference resolvers omit it.
- `generateFederatedSDL` prints the federated schema (including `_service` and `_entities`), so entity-only subgraphs produce valid SDL.
- Object patterns accept both `{ service, rpc }` (GrpcMethod decorator contract) and `{ service, method }`.
