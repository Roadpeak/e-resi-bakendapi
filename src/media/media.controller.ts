import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MediaType, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AddMediaDto } from './dto/add-media.dto.js';
import { PresignUploadDto } from './dto/presign-upload.dto.js';
import { MediaService } from './media.service.js';
import type { UploadFolder } from './storage.service.js';

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(private readonly service: MediaService) {}

  // ─── Presigned URL (client uploads directly to Cloudinary) ────────────────────────

  @Post('presign')
  @ApiBearerAuth()
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get signed Cloudinary direct-upload parameters' })
  getPresignedUrl(@Body() dto: PresignUploadDto) {
    return this.service.getPresignedUrl(dto);
  }

  // ─── Server-side upload ────────────────────────────────────────────────────

  @Post('upload')
  @ApiBearerAuth()
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, folder: { type: 'string' } } } })
  @ApiOperation({ summary: 'Upload a file to Cloudinary via the API (max 50MB)' })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    return this.service.uploadFile((folder ?? 'properties') as UploadFolder, file);
  }

  // ─── Property media ────────────────────────────────────────────────────────

  @Public()
  @Get('properties/:slug')
  @ApiOperation({ summary: 'Public: list all media for a property' })
  @ApiQuery({ name: 'type', enum: MediaType, required: false })
  listForProperty(
    @Param('slug') slug: string,
    @Query('type') type?: MediaType,
  ) {
    return this.service.listForProperty(slug, type);
  }

  @Post('properties/:slug')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: attach a media record to a property' })
  addToProperty(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: AddMediaDto,
  ) {
    return this.service.addToProperty(slug, user.id, user.role, dto);
  }

  @Patch('properties/:slug/reorder')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: reorder media assets for a property' })
  reorder(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body('orderedIds') orderedIds: string[],
  ) {
    return this.service.reorder(slug, user.id, user.role, orderedIds);
  }

  // ─── Rent listing media ────────────────────────────────────────────────────

  @Post('rent-listings/:id')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: attach a media record to a rent listing' })
  addToRentListing(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: AddMediaDto,
  ) {
    return this.service.addToRentListing(id, user.id, user.role, dto);
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  @Delete(':id')
  @ApiBearerAuth()
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Developer: delete a media asset' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.remove(id, user.id, user.role);
  }
}
