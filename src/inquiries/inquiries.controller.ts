import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InquiryStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateInquiryDto } from './dto/create-inquiry.dto.js';
import { ReplyInquiryDto } from './dto/reply-inquiry.dto.js';
import { InquiriesService } from './inquiries.service.js';

@ApiTags('Inquiries')
@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly service: InquiriesService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Submit an inquiry (public or authenticated)' })
  create(
    @Body() dto: CreateInquiryDto,
    @Query('userId') userId?: string,
  ) {
    // userId passed optionally when user is logged in but we use @Public for guests
    return this.service.create(dto, userId);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: list all inquiries' })
  @ApiQuery({ name: 'status', enum: InquiryStatus, required: false })
  findAll(
    @Query() pagination: PaginationDto,
    @Query('status') status?: InquiryStatus,
  ) {
    return this.service.findAll(pagination, status);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Authenticated user: list own inquiries' })
  findMine(
    @CurrentUser() user: { id: string },
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findMine(user.id, pagination);
  }

  @Get('developer')
  @Roles(UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: list inquiries on own properties/listings' })
  @ApiQuery({ name: 'status', enum: InquiryStatus, required: false })
  findForDeveloper(
    @CurrentUser() user: { id: string },
    @Query() pagination: PaginationDto,
    @Query('status') status?: InquiryStatus,
  ) {
    return this.service.findForDeveloper(user.id, pagination, status);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get inquiry detail (owner or developer of the property)' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.findOne(id, user.id, user.role);
  }

  @Post(':id/reply')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reply to an inquiry' })
  reply(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: ReplyInquiryDto,
  ) {
    return this.service.reply(id, user.id, user.role, dto);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update inquiry status (developer or admin)' })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body('status') status: InquiryStatus,
  ) {
    return this.service.updateStatus(id, user.id, user.role, status);
  }
}
