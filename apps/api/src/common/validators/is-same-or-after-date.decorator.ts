import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

/**
 * Cross-field date validator: fails unless this property's date is on or
 * after the named sibling property's date. Used on period-end fields (e.g.
 * payroll runs, tax computations) where nothing previously stopped a caller
 * from submitting an inverted period — the API would accept it and produce
 * nonsensical downstream results instead of a clean 400.
 */
export function IsSameOrAfterDate(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSameOrAfterDate',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName];
          if (typeof value !== 'string' || typeof relatedValue !== 'string') return true;
          const date = new Date(value);
          const relatedDate = new Date(relatedValue);
          if (Number.isNaN(date.getTime()) || Number.isNaN(relatedDate.getTime())) return true;
          return date.getTime() >= relatedDate.getTime();
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          return `${args.property} must be on or after ${relatedPropertyName}`;
        },
      },
    });
  };
}
