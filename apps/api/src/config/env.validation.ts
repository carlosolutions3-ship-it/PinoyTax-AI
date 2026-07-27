import * as Joi from 'joi';

/**
 * Fails fast at boot if a variable the app cannot safely run without is
 * missing — e.g. an unset JWT_ACCESS_SECRET would otherwise sign/verify
 * every access token with `undefined` and only surface as an auth failure
 * on the first request. Everything else keeps the defaults already applied
 * in src/config/*.config.ts; `.unknown(true)` lets those optional vars
 * (S3, SMTP, ANTHROPIC_API_KEY, etc.) pass through unvalidated.
 */
export const envValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().uri().required(),
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
})
  .unknown(true)
  .required();
