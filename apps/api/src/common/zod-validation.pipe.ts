import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

type ZodDtoClass<T extends z.ZodType = z.ZodType> = {
  new (): z.output<T>;
  schema: T;
};

/**
 * DTO-класс из zod-схемы: тип берётся из схемы,
 * а глобальный ZodValidationPipe валидирует по static schema.
 */
export function createZodDto<T extends z.ZodType>(schema: T): ZodDtoClass<T> {
  class ZodDto {
    static schema = schema;
  }
  return ZodDto as unknown as ZodDtoClass<T>;
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    const schema = (metadata.metatype as Partial<ZodDtoClass> | undefined)?.schema;
    if (!schema) return value;

    const result = schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
