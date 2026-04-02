import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, type StrategyOptionsWithRequest } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { JwtPayload } from '../interfaces/jwt-payload.interface.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';

const CACHE_TTL_MS = 30_000; // 30 seconds

interface CacheEntry {
  user: AuthenticatedUser;
  expiresAt: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly userCache = new Map<string, CacheEntry>();

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.getOrThrow<string>('SUPABASE_JWT_SECRET');

    const supabaseUrl = configService.getOrThrow<string>('SUPABASE_URL');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      audience: 'authenticated',
      issuer: `${supabaseUrl}/auth/v1`,
      passReqToCallback: true,
    } satisfies StrategyOptionsWithRequest);
  }

  async validate(req: Request, payload: JwtPayload): Promise<AuthenticatedUser> {
    // Key cache by raw token (unique per session) instead of sub
    const rawToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req) ?? payload.sub;

    const cached = this.userCache.get(rawToken);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    // Cache miss — query DB
    const usuario = await this.prisma.usuario.findUnique({
      where: { auth_user_id: payload.sub },
      include: {
        perfil: true,
        escolas_as_coord_inf: { select: { id: true } },
        escolas_as_coord_fund: { select: { id: true } },
        escolas_as_diretor: { select: { id: true } },
        turmas_as_professora: { select: { id: true, escola_id: true } },
        turmas_as_auxiliar: { select: { id: true, escola_id: true } },
      },
    });

    if (!usuario || !usuario.ativo) {
      this.userCache.delete(rawToken);
      throw new UnauthorizedException('Usuário não encontrado ou inativo');
    }

    const escolaIdSet = new Set<string>();
    usuario.escolas_as_coord_inf.forEach((e) => escolaIdSet.add(e.id));
    usuario.escolas_as_coord_fund.forEach((e) => escolaIdSet.add(e.id));
    usuario.escolas_as_diretor.forEach((e) => escolaIdSet.add(e.id));
    usuario.turmas_as_professora.forEach((t) => escolaIdSet.add(t.escola_id));
    usuario.turmas_as_auxiliar.forEach((t) => escolaIdSet.add(t.escola_id));

    // Secretaria: load all escolas for their municipio
    if (usuario.perfil.nome === 'secretaria' && usuario.municipio_id) {
      const muniEscolas = await this.prisma.escola.findMany({
        where: { municipio_id: usuario.municipio_id },
        select: { id: true },
      });
      muniEscolas.forEach((e) => escolaIdSet.add(e.id));
    }

    const turmaIdSet = new Set<string>();
    usuario.turmas_as_professora.forEach((t) => turmaIdSet.add(t.id));
    usuario.turmas_as_auxiliar.forEach((t) => turmaIdSet.add(t.id));

    const user: AuthenticatedUser = {
      id: usuario.id,
      authUserId: payload.sub,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil.nome as AuthenticatedUser['perfil'],
      municipioId: usuario.municipio_id,
      escolaIds: [...escolaIdSet],
      turmaIds: [...turmaIdSet],
      ativo: usuario.ativo,
    };

    this.userCache.set(rawToken, {
      user,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return user;
  }
}
