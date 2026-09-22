import 'reflect-metadata';
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
  GraphQLUnionType,
  printSchema,
} from 'graphql';
import { SchemaBuilder } from '@galaxy-stack/orbit-graphql';
import {
  KEY_METADATA,
  EXTERNAL_METADATA,
  REQUIRES_METADATA,
  PROVIDES_METADATA,
  EXTENDS_METADATA,
  SHAREABLE_METADATA,
  type KeyOptions,
} from '../decorators/federation.decorators';
import { RESOLVE_REFERENCE_METADATA } from '../decorators/reference-resolver.decorator';

export interface FederationSchemaOptions {
  resolvers?: any[];
  orphanedTypes?: any[];
}

export class FederationSchemaBuilder extends SchemaBuilder {
  private entityTypes: Map<string, GraphQLObjectType> = new Map();
  private referenceResolvers: Map<string, Function> = new Map();

  buildSubgraphSchema(options: FederationSchemaOptions = {}): GraphQLSchema {
    const schema = this.build();
    return this.addFederationTypes(schema);
  }

  private addFederationTypes(schema: GraphQLSchema): GraphQLSchema {
    const queryType = schema.getQueryType();
    const mutationType = schema.getMutationType();
    const subscriptionType = schema.getSubscriptionType();

    const _Any = GraphQLString;

    // The SDL must describe the FEDERATED schema (including _service and
    // _entities themselves) — printing the caller's schema misses them and
    // yields an empty document for entity-only subgraphs.
    let federatedSchemaRef: GraphQLSchema | undefined;
    const _Service = new GraphQLObjectType({
      name: '_Service',
      fields: {
        sdl: {
          type: GraphQLString,
          resolve: () => this.generateFederatedSDL(federatedSchemaRef ?? schema),
        },
      },
    });

    const entities = Array.from(this.entityTypes.values());
    
    const _Entity = entities.length > 0
      ? new GraphQLUnionType({
          name: '_Entity',
          types: entities,
        })
      : null;

    const federatedQueryFields: Record<string, any> = {};

    if (queryType) {
      const existingFields = queryType.getFields();
      for (const [name, field] of Object.entries(existingFields)) {
        federatedQueryFields[name] = {
          type: field.type,
          args: field.args.reduce((acc, arg) => {
            acc[arg.name] = {
              type: arg.type,
              defaultValue: arg.defaultValue,
              description: arg.description,
            };
            return acc;
          }, {} as any),
          resolve: field.resolve,
          description: field.description,
        };
      }
    }

    federatedQueryFields['_service'] = {
      type: new GraphQLNonNull(_Service),
      resolve: () => ({}),
    };

    if (_Entity && entities.length > 0) {
      federatedQueryFields['_entities'] = {
        type: new GraphQLNonNull(new GraphQLList(_Entity)),
        args: {
          representations: {
            type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
          },
        },
        resolve: async (_: any, { representations }: any) => {
          return Promise.all(
            representations.map(async (rep: any) => {
              const parsed = typeof rep === 'string' ? JSON.parse(rep) : rep;
              const typename = parsed.__typename;
              const resolver = this.referenceResolvers.get(typename);
              if (resolver) {
                const resolved = await resolver(parsed);
                // Unions need __typename to pick the concrete type; reference
                // resolvers may not set it, so stamp it from the representation.
                if (resolved && typeof resolved === 'object' && !('__typename' in resolved)) {
                  return { ...resolved, __typename: typename };
                }
                return resolved;
              }
              return null;
            })
          );
        },
      };
    }

    const federatedQuery = new GraphQLObjectType({
      name: 'Query',
      fields: federatedQueryFields,
    });

    federatedSchemaRef = new GraphQLSchema({
      query: federatedQuery,
      mutation: mutationType || undefined,
      subscription: subscriptionType || undefined,
    });

    return federatedSchemaRef;
  }

  private generateFederatedSDL(schema: GraphQLSchema): string {
    let sdl = printSchema(schema);

    sdl = `
extend schema
  @link(url: "https://specs.apollo.dev/federation/v2.0",
        import: ["@key", "@external", "@requires", "@provides", "@shareable", "@extends"])

${sdl}`;

    return sdl;
  }

  registerEntity(type: any, objectType: GraphQLObjectType): void {
    const keys: KeyOptions[] = Reflect.getMetadata(KEY_METADATA, type) || [];
    
    if (keys.length > 0) {
      this.entityTypes.set(objectType.name, objectType);
    }
  }

  registerReferenceResolver(typename: string, resolver: Function): void {
    this.referenceResolvers.set(typename, resolver);
  }

  getEntityDirectives(type: any): string[] {
    const directives: string[] = [];
    
    const keys: KeyOptions[] = Reflect.getMetadata(KEY_METADATA, type) || [];
    for (const key of keys) {
      const resolvable = key.resolvable !== false ? '' : ', resolvable: false';
      directives.push(`@key(fields: "${key.fields}"${resolvable})`);
    }

    if (Reflect.getMetadata(EXTENDS_METADATA, type)) {
      directives.push('@extends');
    }

    if (Reflect.getMetadata(SHAREABLE_METADATA, type) === true) {
      directives.push('@shareable');
    }

    return directives;
  }

  getFieldDirectives(type: any, fieldName: string): string[] {
    const directives: string[] = [];

    const externals: string[] = Reflect.getMetadata(EXTERNAL_METADATA, type) || [];
    if (externals.includes(fieldName)) {
      directives.push('@external');
    }

    const requires: Record<string, string> = Reflect.getMetadata(REQUIRES_METADATA, type) || {};
    if (requires[fieldName]) {
      directives.push(`@requires(fields: "${requires[fieldName]}")`);
    }

    const provides: Record<string, string> = Reflect.getMetadata(PROVIDES_METADATA, type) || {};
    if (provides[fieldName]) {
      directives.push(`@provides(fields: "${provides[fieldName]}")`);
    }

    const shareables: string[] = Reflect.getMetadata(SHAREABLE_METADATA, type) || [];
    if (Array.isArray(shareables) && shareables.includes(fieldName)) {
      directives.push('@shareable');
    }

    return directives;
  }
}
