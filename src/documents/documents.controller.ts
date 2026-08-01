import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateDocumentDto } from './dto/create-document.dto.js';
import { DocumentsService } from './documents.service.js';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a document record (after uploading the file to Cloudinary)' })
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateDocumentDto,
  ) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: list all documents' })
  findAll(@Query() pagination: PaginationDto) {
    return this.service.findAll(pagination);
  }

  @Get('mine')
  @ApiOperation({ summary: 'User: list own documents' })
  findMine(
    @CurrentUser() user: { id: string },
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findMine(user.id, pagination);
  }

  @Get('reservations/:reservationId')
  @ApiOperation({ summary: 'List documents for a reservation (owner, developer, or admin)' })
  findForReservation(
    @Param('reservationId') reservationId: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.findForReservation(reservationId, user.id, user.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a document' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.remove(id, user.id, user.role);
  }
}
