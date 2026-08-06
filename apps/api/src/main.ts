import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { installProcessErrorHandlers } from './common/process-error-handlers';
import { setupSwagger } from './swagger';
import { PrismaService } from './common/prisma/prisma.service';

// APP_WEB_URL is matched against the browser's Origin header, which never
// has a trailing slash — a value like "https://web-production-xxxx.up.railway.app/"
// (trailing slash) or one with stray whitespace from how it was pasted into
// a dashboard would silently fail this exact-string CORS match and reject
// every browser request, surfacing to users as a generic "Unable to log
// in" (the frontend can't distinguish a CORS rejection from any other
// network failure — see apps/web/src/lib/api-client.ts).
const webOrigin = (process.env.APP_WEB_URL ?? 'http://localhost:3000').trim().replace(/\/+$/, '');

// Creates/promotes the platform admin on every boot, guarded by env vars and
// idempotent (upsert), so it's safe to leave running. This exists because
// this app's hosting platforms vary in whether they reliably run a separate
// preDeploy/one-off command before starting the main process — the main
// process itself is the one thing every platform reliably starts and keeps
// running, so bootstrapping the admin here has no dependency on any
// platform-specific deploy-command mechanism working correctly.
async function seedPlatformAdminOnBoot(prisma: PrismaService, logger: Logger): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return;

  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.upsert({
      where: { email: email.toLowerCase() },
      create: {
        email: email.toLowerCase(),
        passwordHash,
        firstName: 'Platform',
        lastName: 'Administrator',
        isEmailVerified: true,
        isPlatformAdmin: true,
        status: 'active',
      },
      update: { isPlatformAdmin: true },
    });
    logger.log(`Platform admin ensured for ${email.toLowerCase()}`, 'Bootstrap');
  } catch (err) {
    // Never block app startup over this — log and continue serving traffic.
    logger.error(`Platform admin bootstrap failed: ${(err as Error).message}`, 'Bootstrap');
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: webOrigin,
      credentials: true,
    },
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  installProcessErrorHandlers(app.get(Logger));
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/live', 'health/ready', 'docs'] });
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips unknown properties from every DTO
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  setupSwagger(app);

  await seedPlatformAdminOnBoot(app.get(PrismaService), app.get(Logger));

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap();

