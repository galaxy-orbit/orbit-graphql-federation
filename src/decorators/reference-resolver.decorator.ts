import 'reflect-metadata';

export const REFERENCE_RESOLVER_METADATA = 'federation:referenceResolver';
export const RESOLVE_REFERENCE_METADATA = 'federation:resolveReference';

export interface ReferenceResolverMetadata {
  methodName: string;
  typeFn?: () => any;
}

export function ResolveReference(): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    Reflect.defineMetadata(RESOLVE_REFERENCE_METADATA, {
      methodName: propertyKey as string,
    }, target.constructor);
  };
}

export function ReferenceResolver(): MethodDecorator {
  return ResolveReference();
}
