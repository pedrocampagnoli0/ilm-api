import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './common/auth/auth.module.js';
import { CaslModule } from './common/casl/casl.module.js';
import { HealthModule } from './health/health.module.js';
import { EscolaModule } from './escola/escola.module.js';
import { MunicipioModule } from './municipio/municipio.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, string>) => {
        const required = [
          'DATABASE_URL',
          'SUPABASE_JWT_SECRET',
          'SUPABASE_URL',
        ];
        for (const key of required) {
          if (!config[key]) {
            throw new Error(`Missing required environment variable: ${key}`);
          }
        }
        return config;
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    CaslModule,
    HealthModule,
    EscolaModule,
    MunicipioModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
