import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('PinoyTax AI API')
    .setDescription(
      'AI-powered tax compliance, accounting, payroll, and government filing platform for Philippine businesses.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addTag('auth', 'Authentication and session management')
    .addTag('companies', 'Company profile and organization management')
    .addTag('payroll', 'Payroll and employee management')
    .addTag('tax-computations', 'Deterministic tax computation engine')
    .addTag('compliance', 'Filing deadlines and compliance monitoring')
    .addTag('ai', 'AI Tax Assistant')
    .addTag('documents', 'Secure document vault')
    .addTag('forms', 'Government form library')
    .addTag('notifications', 'Notifications and preferences')
    .addTag('admin', 'Platform administration')
    .addTag('health', 'Health and readiness checks')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
