import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Controller, Get } from '@nestjs/common'
import { DbModule } from './db/db.module'
import { InvitacionesModule } from './invitaciones/invitaciones.module'
import { AlbumFotosModule } from './album-fotos/album-fotos.module'
import { MuestraComentariosModule } from './muestra-comentarios/muestra-comentarios.module'
import { UsuariosModule } from './usuarios/usuarios.module'

@Controller('health')
class HealthController {
  @Get()
  check() {
    return { ok: true, service: 'casamiento-vanesa-augusto-api' }
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    InvitacionesModule,
    AlbumFotosModule,
    MuestraComentariosModule,
    UsuariosModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
