import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger'
import { InvitationsService, type InvitationStatus } from './invitations.service'

class CreateInvitationDto {
  @ApiProperty({ example: 'Jane Doe' })
  name!: string

  @ApiPropertyOptional({ example: false, description: 'Whether the guest may bring a plus-one' })
  allowsPlusOne?: boolean
}

class RsvpDto {
  @ApiProperty({ example: 'yes', enum: ['yes', 'no', 'unsure'] })
  status!: InvitationStatus

  @ApiPropertyOptional({ example: 'John Doe', description: 'Plus-one name when status is yes and allowed' })
  plusOneName?: string | null

  @ApiProperty({ example: false, description: 'Whether the guest has dietary restrictions' })
  hasDietaryRestrictions!: boolean

  @ApiPropertyOptional({ example: 'Gluten-free', description: 'Detail when hasDietaryRestrictions is true' })
  dietaryRestrictions?: string | null
}

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @ApiOperation({ summary: 'List invitations (dashboard)' })
  list() {
    return this.invitations.list()
  }

  @Post()
  @ApiOperation({ summary: 'Create invitation with unique token' })
  create(@Body() body: CreateInvitationDto) {
    return this.invitations.create(body.name, !!body.allowsPlusOne)
  }

  @Get('by-token/:token')
  @ApiOperation({ summary: 'Get public invitation by token' })
  getByToken(@Param('token') token: string) {
    return this.invitations.getByToken(token)
  }

  @Patch('by-token/:token/rsvp')
  @ApiOperation({ summary: 'Submit RSVP by token' })
  rsvp(@Param('token') token: string, @Body() body: RsvpDto) {
    return this.invitations.rsvp(token, {
      status: body.status,
      plusOneName: body.plusOneName,
      hasDietaryRestrictions: body.hasDietaryRestrictions,
      dietaryRestrictions: body.dietaryRestrictions,
    })
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an invitation' })
  remove(@Param('id') id: string) {
    return this.invitations.softDelete(Number(id))
  }
}
