import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Controller, Get } from '@nestjs/common'
import { DbModule } from './db/db.module'
import { InvitationsModule } from './invitations/invitations.module'
import { AlbumPhotosModule } from './album-photos/album-photos.module'
import { PreviewCommentsModule } from './preview-comments/preview-comments.module'
import { UsersModule } from './users/users.module'

@Controller('health')
class HealthController {
  @Get()
  check() {
    return { ok: true, service: 'backend-bridge' }
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
  controllers: [HealthController],
})
export class AppModule {}
