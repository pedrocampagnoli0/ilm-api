import { Injectable, Logger, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, type StrategyOptionsWithRequest } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { JwtPayload } from '../interfaces/jwt-payload.interface.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';

const CACHE_TTL_MS = 30_000; // 30 seconds
const IMPERSONATE_HEADER = 'x-impersonate-user-id';

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
    const rawToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req) ?? payload.sub;
    const impersonateId = this.readImpersonateHeader(req);

    // Cache key combines token + impersonate target so a single session can
    // switch targets without collisions.
    const cacheKey = impersonateId ? `${rawToken}::imp::${impersonateId}` : rawToken;

    const cached = this.userCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    // Always resolve the real (JWT-authenticated) user first.
    const realUser = await this.loadUserByAuthId(payload.sub);
    if (!realUser) {
      this.userCache.delete(cacheKey);
      throw new UnauthorizedException('Usuário não encontrado ou inativo');
    }

    // If no impersonate header, return the real user.
    if (!impersonateId) {
      const user = await this.buildAuthenticatedUser(realUser, payload.sub);
      this.userCache.set(cacheKey, { user, expiresAt: Date.now() + CACHE_TTL_MS });
      return user;
    }

    // Impersonate path: validate permission and load the target.
    if (realUser.perfil.nome !== 'administrador') {
      throw new ForbiddenException('Impersonate só é permitido para perfil administrador.');
    }
    const perm = await this.prisma.usuario_impersonate_perm.findUnique({
      where: { usuario_id: realUser.id },
      select: { usuario_id: true },
    });
    if (!perm) {
      throw new ForbiddenException('Você não tem permissão de impersonate.');
    }

    const target = await this.loadUserById(impersonateId);
    if (!target) {
      throw new UnauthorizedException('Usuário-alvo de impersonate não encontrado ou inativo.');
    }

    // Build identity from the target. Keep authUserId of the IMPERSONATOR for audit.
    const user = await this.buildAuthenticatedUser(target, payload.sub);
    this.userCache.set(cacheKey, { user, expiresAt: Date.now() + CACHE_TTL_MS });
    return user;
  }

  private readImpersonateHeader(req: Request): string | null {
    const raw = req.headers[IMPERSONATE_HEADER];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async loadUserByAuthId(authUserId: string) {
    return this.prisma.usuario.findUnique({
      where: { auth_user_id: authUserId },
      include: this.userInclude(),
    });
  }

  private async loadUserById(usuarioId: string) {
    return this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: this.userInclude(),
    });
  }

  private userInclude() {
    return {
      perfil: true,
      escolas_as_coord_inf: { select: { id: true } },
      escolas_as_coord_fund: { select: { id: true } },
      escolas_as_diretor: { select: { id: true } },
      turmas_as_professora: { select: { id: true, escola_id: true } },
      turmas_as_auxiliar: { select: { id: true, escola_id: true } },
      assessora_municipios: { select: { municipio_id: true } },
    } as const;
  }

  private async buildAuthenticatedUser(
    usuario: NonNullable<Awaited<ReturnType<typeof this.loadUserByAuthId>>>,
    impersonatorAuthUserId: string,
  ): Promise<AuthenticatedUser> {
    if (!usuario.ativo) {
      throw new UnauthorizedException('Usuário não encontrado ou inativo');
    }

    const escolaIdSet = new Set<string>();
    usuario.escolas_as_coord_inf.forEach((e) => escolaIdSet.add(e.id));
    usuario.escolas_as_coord_fund.forEach((e) => escolaIdSet.add(e.id));
    usuario.escolas_as_diretor.forEach((e) => escolaIdSet.add(e.id));
    usuario.turmas_as_professora.forEach((t) => escolaIdSet.add(t.escola_id));
    usuario.turmas_as_auxiliar.forEach((t) => escolaIdSet.add(t.escola_id));

    // Secretaria: load all escolas for their município (existing behavior).
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

    return {
      id: usuario.id,
      // authUserId always reflects the JWT subject (the real authenticated user),
      // not the impersonated target. This preserves auditability.
      authUserId: impersonatorAuthUserId,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil.nome as AuthenticatedUser['perfil'],
      municipioId: usuario.municipio_id,
      escolaIds: [...escolaIdSet],
      turmaIds: [...turmaIdSet],
      assessoraMunicipioIds: usuario.assessora_municipios.map((am) => am.municipio_id),
      ativo: usuario.ativo,
    };
  }
}
