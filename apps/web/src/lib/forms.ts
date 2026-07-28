// Optional string fields (e.g. email) go through class-validator's
// @IsOptional() on the backend, which only skips validation for
// null/undefined — an empty string still runs through @IsEmail() etc. and
// fails. Forms that leave an optional field blank must omit the key
// entirely rather than send '', so this strips empty strings before
// building the request body.
export function omitEmptyStrings<T extends object>(obj: T): Partial<T> {
  const result: Partial<Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== '') {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}
