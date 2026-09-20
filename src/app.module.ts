import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Controller, Get } from '@nestjs/common'
import { DbModule } from './db/db.module'
import { InvitationsModule } from './invitations/invitations.module'
import { AlbumPhotosModule } from './album-photos/album-photos.module'
import { PreviewCommentsModule } from './preview-comments/preview-comments.module'
import { UsersModule } from './users/users.module'

@Controller()
class RootController {
  @Get()
  root() {
    return {
      ok: true,
      service: 'casamiento-backend',
      docs: '/docs',
      health: '/health',
      api: '/api',
    }
  }

  @Get('health')
  health() {
    return { ok: true, service: 'casamiento-backend' }
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    InvitationsModule,
    AlbumPhotosModule,
    PreviewCommentsModule,
    UsersModule,
  ],
  controllers: [RootController],
})
export class AppModule {}
