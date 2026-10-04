import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'

/** Orígenes del front en prod/dev; se unen a CORS_ORIGINS (Railway). */
const CASAMIENTO_CORS_ORIGINS = [
  'https://casamientovanesayaugusto.com',
  'https://www.casamientovanesayaugusto.com',
  'https://casamiento-vanesa-augusto.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
] as const

function resolveCorsOrigins(corsRaw: string): boolean | string[] {
  if (corsRaw === '*') return true
  const fromEnv = corsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  return [...new Set([...CASAMIENTO_CORS_ORIGINS, ...fromEnv])]
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)

  app.setGlobalPrefix('api', { exclude: ['/', 'health'] })

  const corsRaw = config.get<string>('CORS_ORIGINS', '*')
  app.enableCors({
    origin: resolveCorsOrigins(corsRaw),
    credentials: corsRaw !== '*',
  })

  const swagger = new DocumentBuilder()
    .setTitle('Backend Bridge API')
    .setDescription('Wedding invitation backend: invitations, RSVP, collaborative album, preview comments.')
    .setVersion('0.1.0')
    .build()
  const document = SwaggerModule.createDocument(app, swagger)
  SwaggerModule.setup('docs', app, document)

  const port = Number(config.get('PORT') || 3400)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`casamiento-backend listening on :${port} · docs /docs · health /health`)
}

void bootstrap()
