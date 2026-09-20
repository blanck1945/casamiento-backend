import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common'
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger'
import { PreviewCommentsService } from './preview-comments.service'

class CreatePreviewCommentDto {
  @ApiProperty({ example: 'rsvp' })
  sectionId!: string

  @ApiProperty({ example: 'RSVP' })
  sectionLabel!: string

  @ApiProperty({ example: 'Move the button slightly lower' })
  text!: string

  @ApiProperty({ example: 42.5 })
  xPct!: number

  @ApiProperty({ example: 63.2 })
  yPct!: number
}

@ApiTags('preview-comments')
@Controller('preview-comments')
export class PreviewCommentsController {
  constructor(private readonly comments: PreviewCommentsService) {}

  @Get()
  @ApiOperation({ summary: 'List preview design comments' })
  list() {
    return this.comments.list()
  }

  @Post()
  @ApiOperation({ summary: 'Create a preview pin comment' })
  create(@Body() body: CreatePreviewCommentDto) {
    return this.comments.create(body)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one preview comment' })
  remove(@Param('id') id: string) {
    return this.comments.remove(Number(id))
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all preview comments' })
  clear() {
    return this.comments.clear()
  }
}
