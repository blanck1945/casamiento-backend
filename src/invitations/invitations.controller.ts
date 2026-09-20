import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger'
import type { Express } from 'express'
import { memoryStorage } from 'multer'
import { CommsService } from '../comms/comms.service'
import { InvitationsService, type GuestSide, type InvitationStatus } from './invitations.service'

const MAX_CSV_BYTES = 512 * 1024

class CreateInvitationDto {
  @ApiProperty({ example: 'Jane Doe' })
  name!: string

  @ApiPropertyOptional({ example: false, description: 'Whether the guest may bring a plus-one' })
  allowsPlusOne?: boolean

  @ApiPropertyOptional({
    example: 'vanesa',
    enum: ['vanesa', 'augusto'],
    description: 'Which side of the couple invited this guest',
  })
  guestSide?: GuestSide

  @ApiPropertyOptional({ example: 'maria@example.com' })
  email?: string | null
}

class UpdateInvitationDto {
  @ApiProperty({ example: 'Jane Doe' })
  name!: string

  @ApiProperty({ example: false, description: 'Whether the guest may bring a plus-one' })
  allowsPlusOne!: boolean

  @ApiPropertyOptional({
    example: 'vanesa',
    enum: ['vanesa', 'augusto'],
    description: 'Which side of the couple invited this guest',
  })
  guestSide?: GuestSide

  @ApiPropertyOptional({ example: 'maria@example.com' })
  email?: string | null
}

class BulkImportRowDto {
  @ApiProperty({ example: 'María López' })
  name!: string

  @ApiPropertyOptional({ example: 'maria@example.com' })
  email?: string | null

  @ApiProperty({ example: 'vanesa', enum: ['vanesa', 'augusto'] })
  guestSide!: GuestSide

  @ApiProperty({ example: false })
  allowsPlusOne!: boolean
}

class BulkImportConfirmDto {
  @ApiProperty({ type: [BulkImportRowDto] })
  rows!: BulkImportRowDto[]
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
  constructor(
    private readonly invitations: InvitationsService,
    private readonly comms: CommsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List invitations (dashboard)' })
  list() {
    return this.invitations.list()
  }

  @Post()
  @ApiOperation({ summary: 'Create invitation with unique token' })
  create(@Body() body: CreateInvitationDto) {
    return this.invitations.create(body.name, !!body.allowsPlusOne, body.guestSide, body.email)
  }

  @Post('bulk/preview')
  @ApiOperation({ summary: 'Preview CSV import — detect existing guests by name' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_CSV_BYTES },
    }),
  )
  bulkPreview(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('CSV file is required')
    }
    return this.invitations.previewCsvImport(file.buffer)
  }

  @Post('bulk/confirm')
  @ApiOperation({ summary: 'Confirm bulk import for selected rows' })
  bulkConfirm(@Body() body: BulkImportConfirmDto) {
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      throw new BadRequestException('rows array is required')
    }
    return this.invitations.bulkCreateRows(body.rows)
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Bulk import invitations from CSV (skips existing names)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'CSV with columns nombre,email,lado,invita' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_CSV_BYTES },
    }),
  )
  bulkImport(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('CSV file is required')
    }
    return this.invitations.importFromCsv(file.buffer)
  }

  @Post('send-email/pending')
  @ApiOperation({ summary: 'Send invitation emails to all pending guests (max 50)' })
  async sendPendingEmails() {
    const pending = await this.invitations.listPendingEmail(50)
    const sent: { id: number; email: string }[] = []
    const errors: { id: number; message: string }[] = []

    for (const inv of pending) {
      if (!inv.email) continue
      try {
        const link = this.comms.buildPublicLink(inv.token)
        await this.comms.sendInvitationEmail({ to: inv.email, guestName: inv.name, link })
        await this.invitations.markEmailSent(inv.id)
        sent.push({ id: inv.id, email: inv.email })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ id: inv.id, message })
      }
    }

    return {
      sent,
      errors,
      summary: { ok: sent.length, failed: errors.length },
    }
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

  @Post(':id/send-email')
  @ApiOperation({ summary: 'Send invitation email to a guest' })
  async sendEmail(@Param('id') id: string) {
    const inv = await this.invitations.getById(Number(id))
    if (!inv.email) {
      throw new BadRequestException('invitation has no email address')
    }
    const link = this.comms.buildPublicLink(inv.token)
    await this.comms.sendInvitationEmail({ to: inv.email, guestName: inv.name, link })
    return this.invitations.markEmailSent(inv.id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update invitation details (dashboard)' })
  update(@Param('id') id: string, @Body() body: UpdateInvitationDto) {
    return this.invitations.update(Number(id), body.name, body.allowsPlusOne, body.guestSide, body.email)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an invitation' })
  remove(@Param('id') id: string) {
    return this.invitations.softDelete(Number(id))
  }
}
