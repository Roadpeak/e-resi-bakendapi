import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException();

    // A staff member acts as their employer: the request continues with the
    // employer's user id, so every developer-scoped service resolves the
    // employer's profile unchanged. Their own identity and page grants ride
    // along for /auth/me, the UI, and the activity log.
    const membership = await this.prisma.developerStaff.findUnique({
      where: { userId: user.id },
      include: { developer: { select: { userId: true } } },
    });
    if (membership) {
      if (membership.status !== 'ACTIVE') throw new UnauthorizedException('Access revoked');
      const employer = await this.prisma.user.findUnique({
        where: { id: membership.developer.userId },
      });
      if (!employer || !employer.isActive) throw new UnauthorizedException();
      return {
        ...employer,
        staff: {
          id: membership.id,
          userId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          pages: membership.pages,
        },
      };
    }

    return user;
  }
}
