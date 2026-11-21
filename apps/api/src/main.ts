import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  console.info('API startup configuration:', {
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    jwtSecretConfigured: Boolean(process.env.JWT_SECRET),
    corsConfigured: Boolean(process.env.CORS_ORIGINS),
  });

  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.disable('x-powered-by');
  expressApp.set('trust proxy', 1);

  // Security headers middleware
  app.use((_req: unknown, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const allowedOrigins = process.env.CORS_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === 'production' && !allowedOrigins?.length) {
    console.error('Production startup configuration: CORS_ORIGINS is missing.');
    throw new Error('CORS_ORIGINS must be configured in production.');
  }
  app.enableCors({
    origin: allowedOrigins?.length ? allowedOrigins : ['http://localhost:3000'],
    credentials: true,
  });

  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('NEYD Ticketing API')
      .setDescription('Multi-tenant IT service management platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`NEYD API listening on http://localhost:${port}`);
}

bootstrap();
