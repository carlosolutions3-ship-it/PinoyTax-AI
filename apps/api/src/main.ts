import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { installProcessErrorHandlers } from './common/process-error-handlers';
import { setupSwagger } from './swagger';

// APP_WEB_URL is matched against the browser's Origin header, which never
// has a trailing slash — a value like "https://app.vercel.app/" (trailing
// slash) or one with stray whitespace from how it was pasted into a
// dashboard would silently fail this exact-string CORS match and reject
// every browser request, surfacing to users as a generic "Unable to log
// in" (the frontend can't distinguish a CORS rejection from any other
// network failure — see apps/web/src/lib/api-client.ts).
const webOrigin = (process.env.APP_WEB_URL ?? 'http://localhost:3000').trim().replace(/\/+$/, '');

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

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap();

