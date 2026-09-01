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
import { TurmaModule } from './turma/turma.module.js';
import { CicloModule } from './ciclo/ciclo.module.js';
import { UsuarioModule } from './usuario/usuario.module.js';
import { AlunoModule } from './aluno/aluno.module.js';
import { AvaliacaoModule } from './avaliacao/avaliacao.module.js';
import { ResultadoAvaliacaoModule } from './resultado-avaliacao/resultado-avaliacao.module.js';
import { LogLoginModule } from './log-login/log-login.module.js';
import { RankingModule } from './ranking/ranking.module.js';
import { ImportBulkModule } from './import-bulk/import-bulk.module.js';
import { ReuniaoModule } from './reuniao/reuniao.module.js';
import { ObservacaoModule } from './observacao/observacao.module.js';
import { TentativaContatoModule } from './tentativa-contato/tentativa-contato.module.js';
import { FeriadoModule } from './feriado/feriado.module.js';
import { ContatoPrincipalModule } from './contato-principal/contato-principal.module.js';
import { AssessoraMunicipioModule } from './assessora-municipio/assessora-municipio.module.js';
import { UsuarioImpersonatePermModule } from './usuario-impersonate-perm/usuario-impersonate-perm.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';
import { NutrorSyncModule } from './nutror-sync/nutror-sync.module.js';
import { FormacaoModule } from './formacao/formacao.module.js';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
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
    TurmaModule,
    CicloModule,
    UsuarioModule,
    AlunoModule,
    AvaliacaoModule,
    ResultadoAvaliacaoModule,
    LogLoginModule,
    RankingModule,
    ImportBulkModule,
    ReuniaoModule,
    ObservacaoModule,
    TentativaContatoModule,
    FeriadoModule,
    ContatoPrincipalModule,
    AssessoraMunicipioModule,
    UsuarioImpersonatePermModule,
    WebhooksModule,
    NutrorSyncModule,
    FormacaoModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
