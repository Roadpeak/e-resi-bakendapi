import {
  BadRequestException,
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
  // Agents upload verification documents and profile photos through the same
  // path, so restricting this to developers would push them onto the
  // memory-bound server route.
  @Roles(UserRole.DEVELOPER, UserRole.AGENT, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Signed parameters for uploading straight to Cloudinary. Returns '
      + 'direct=false when Cloudinary is unconfigured, in which case the client '
      + 'should post to /media/upload instead.',
  })
  getPresignedUrl(@Body() dto: PresignUploadDto) {
    return this.service.getPresignedUrl(dto);
  }

  // ─── Server-side upload ────────────────────────────────────────────────────

  @Post('upload')
  @ApiBearerAuth()
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  // Fallback path only — clients presign and upload straight to Cloudinary,
  // which is what makes multi-gigabyte videos possible. This route buffers the
  // whole file in memory, so its ceiling stays modest on purpose: raising it
  // to match the direct path would let a few concurrent uploads exhaust the
  // container and take the whole API down, not just the upload.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, folder: { type: 'string' } } } })
  @ApiOperation({
    summary: 'Fallback upload through the API (max 500MB). Prefer /media/presign '
      + 'and uploading straight to Cloudinary — that path has no size ceiling here.',
  })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    return this.service.uploadFile((folder ?? 'properties') as UploadFolder, file);
  }

  /**
   * Avatar upload for any signed-in user. The generic /upload above is
   * developer-only, which left tenants and investors unable to set a profile
   * photo. Folder is fixed to 'avatars' so this can't be used as a general
   * upload channel.
   */
  @Post('avatar')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload your own profile photo (max 5MB)' })
  uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Profile photo must be an image');
    }
    return this.service.uploadFile('avatars' as UploadFolder, file);
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
