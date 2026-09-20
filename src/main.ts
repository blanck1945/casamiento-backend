import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)

  app.setGlobalPrefix('api', { exclude: ['/', 'health'] })

  const corsRaw = config.get<string>('CORS_ORIGINS', '*')
  app.enableCors({
    origin: corsRaw === '*' ? true : corsRaw.split(',').map((s) => s.trim()),
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
