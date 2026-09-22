import 'reflect-metadata';

export const KEY_METADATA = 'federation:key';
export const EXTERNAL_METADATA = 'federation:external';
export const REQUIRES_METADATA = 'federation:requires';
export const PROVIDES_METADATA = 'federation:provides';
export const EXTENDS_METADATA = 'federation:extends';
export const SHAREABLE_METADATA = 'federation:shareable';
export const INACCESSIBLE_METADATA = 'federation:inaccessible';
export const OVERRIDE_METADATA = 'federation:override';
export const TAG_METADATA = 'federation:tag';

export interface KeyOptions {
  fields: string;
  resolvable?: boolean;
}

export interface DirectiveMetadata {
  propertyKey?: string;
  options?: any;
}

export function Directive(sdl: string): ClassDecorator & PropertyDecorator & MethodDecorator {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    const metadataKey = 'federation:directives';
    const existing: string[] = Reflect.getMetadata(metadataKey, target) || [];
    existing.push(sdl);
    Reflect.defineMetadata(metadataKey, existing, target);
  };
}

export function Key(fields: string): ClassDecorator;
export function Key(options: KeyOptions): ClassDecorator;
export function Key(fieldsOrOptions: string | KeyOptions): ClassDecorator {
  return (target) => {
    const options: KeyOptions = typeof fieldsOrOptions === 'string'
      ? { fields: fieldsOrOptions }
      : fieldsOrOptions;

    const existingKeys: KeyOptions[] = Reflect.getMetadata(KEY_METADATA, target) || [];
    existingKeys.push(options);
    Reflect.defineMetadata(KEY_METADATA, existingKeys, target);
  };
}

export function External(): PropertyDecorator {
  return (target, propertyKey) => {
    const existing: string[] = 
      Reflect.getMetadata(EXTERNAL_METADATA, target.constructor) || [];
    existing.push(propertyKey as string);
    Reflect.defineMetadata(EXTERNAL_METADATA, existing, target.constructor);
  };
}

export function Requires(fields: string): PropertyDecorator {
  return (target: Object, propertyKey: string | symbol) => {
    const existing: Record<string, string> = 
      Reflect.getMetadata(REQUIRES_METADATA, target.constructor) || {};
    existing[propertyKey as string] = fields;
    Reflect.defineMetadata(REQUIRES_METADATA, existing, target.constructor);
  };
}

export function Provides(fields: string): PropertyDecorator & MethodDecorator {
  return (target: Object, propertyKey: string | symbol, descriptor?: PropertyDescriptor) => {
    const existing: Record<string, string> = 
      Reflect.getMetadata(PROVIDES_METADATA, target.constructor) || {};
    existing[propertyKey as string] = fields;
    Reflect.defineMetadata(PROVIDES_METADATA, existing, target.constructor);
  };
}

export function Extends(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(EXTENDS_METADATA, true, target);
  };
}

export function Shareable(): ClassDecorator & PropertyDecorator {
  return (target: any, propertyKey?: string | symbol) => {
    if (propertyKey) {
      const existing: string[] = 
        Reflect.getMetadata(SHAREABLE_METADATA, target.constructor) || [];
      existing.push(propertyKey as string);
      Reflect.defineMetadata(SHAREABLE_METADATA, existing, target.constructor);
    } else {
      Reflect.defineMetadata(SHAREABLE_METADATA, true, target);
    }
  };
}

export function Inaccessible(): ClassDecorator & PropertyDecorator {
  return (target: any, propertyKey?: string | symbol) => {
    if (propertyKey) {
      const existing: string[] = 
        Reflect.getMetadata(INACCESSIBLE_METADATA, target.constructor) || [];
      existing.push(propertyKey as string);
      Reflect.defineMetadata(INACCESSIBLE_METADATA, existing, target.constructor);
    } else {
      Reflect.defineMetadata(INACCESSIBLE_METADATA, true, target);
    }
  };
}

export function Override(from: string): PropertyDecorator {
  return (target, propertyKey) => {
    const existing: Record<string, string> = 
      Reflect.getMetadata(OVERRIDE_METADATA, target.constructor) || {};
    existing[propertyKey as string] = from;
    Reflect.defineMetadata(OVERRIDE_METADATA, existing, target.constructor);
  };
}

export function Tag(name: string): ClassDecorator & PropertyDecorator {
  return (target: any, propertyKey?: string | symbol) => {
    // Property decorators receive the prototype (resolve the owning class),
    // class decorators receive the class itself.
    const store = propertyKey ? target.constructor : target;
    const metadataKey = propertyKey ? `${TAG_METADATA}:${String(propertyKey)}` : TAG_METADATA;
    const existing: string[] = Reflect.getMetadata(metadataKey, store) || [];
    existing.push(name);
    Reflect.defineMetadata(metadataKey, existing, store);
  };
}
