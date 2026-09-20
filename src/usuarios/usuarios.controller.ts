import { Body, Controller, Post } from '@nestjs/common'
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger'
import { UsuariosService } from './usuarios.service'

class LoginDto {
  @ApiProperty({ example: 'demo@casamiento.local' })
  email!: string

  @ApiProperty({ example: 'demo123' })
  password!: string
}

@ApiTags('usuarios')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login del dashboard admin (fetch simple, sin SDK externo)' })
  async login(@Body() body: LoginDto) {
    const usuario = await this.usuarios.login(body.email, body.password)
    return { usuario }
  }
}
