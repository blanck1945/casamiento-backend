import { Body, Controller, Post } from '@nestjs/common'
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger'
import { UsersService } from './users.service'

class LoginDto {
  @ApiProperty({ example: 'panel@casamiento.local' })
  email!: string

  @ApiProperty({ example: '********' })
  password!: string
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post('login')
  @ApiOperation({ summary: 'Admin dashboard login' })
  async login(@Body() body: LoginDto) {
    const user = await this.users.login(body.email, body.password)
    return { user }
  }
}
