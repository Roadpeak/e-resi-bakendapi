import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { MandatesService } from './mandates.service.js';

class PublishMandateDto {
  @IsString() propertyId: string;
  @IsNumber() @Min(0) @Max(100) commissionPercent: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) maxAgents?: number;
}

class RequestMandateDto {
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
}

class RespondDto {
  @IsBoolean() accept: boolean;
}

@ApiTags('Mandates')
@ApiBearerAuth()
@Controller('mandates')
export class MandatesController {
  constructor(private readonly mandates: MandatesService) {}

  // Literal routes above ':id' — "mine" and "open" are not mandate ids.

  @Get('open')
  @Roles(UserRole.AGENT)
  @ApiOperation({ summary: 'Agent: the open pool, with my request status on each' })
  listOpen(@CurrentUser() user: { id: string }) {
    return this.mandates.listOpen(user.id);
  }

  @Get('mine')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: my mandates and the requests on them' })
  listMine(@CurrentUser() user: { id: string }) {
    return this.mandates.listMine(user.id);
  }

  @Post()
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: open a property to the agent network' })
  publish(@CurrentUser() user: { id: string }, @Body() dto: PublishMandateDto) {
    return this.mandates.publish(user.id, dto);
  }

  @Patch(':id/close')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: stop accepting requests' })
  close(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.mandates.close(id, user.id);
  }

  @Post(':id/requests')
  @Roles(UserRole.AGENT)
  @ApiOperation({ summary: 'Agent: raise a hand for this mandate' })
  request(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RequestMandateDto,
  ) {
    return this.mandates.request(id, user.id, dto.message);
  }

  @Patch(':id/withdraw')
  @Roles(UserRole.AGENT)
  @ApiOperation({ summary: 'Agent: withdraw my pending request' })
  withdraw(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.mandates.withdraw(id, user.id);
  }

  @Patch('requests/:requestId/respond')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: accept or decline a request — accepting assigns the property' })
  respond(
    @Param('requestId') requestId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RespondDto,
  ) {
    return this.mandates.respond(requestId, user.id, dto.accept);
  }
}
