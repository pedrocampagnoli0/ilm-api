import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AssessoraMetaReunioesService, META_PADRAO } from './assessora-meta-reunioes.service';

const u = (perfil: string) => ({ id: 'u1', perfil }) as any;
const body = { meta_semanal: 25, limite_verde: 18, limite_amarelo: 12 };

function make(model: any) {
  return new AssessoraMetaReunioesService({ assessora_meta_reunioes: model } as any);
}

describe('AssessoraMetaReunioesService', () => {
  it('GET nega perfis que não são ilm/administrador', async () => {
    await expect(make({}).get(u('professor'))).rejects.toThrow(ForbiddenException);
  });

  it('GET devolve o padrão sem linha', async () => {
    const s = make({ findUnique: jest.fn().mockResolvedValue(null) });
    expect(await s.get(u('ilm'))).toEqual({ data: META_PADRAO });
  });

  it('GET devolve o padrão se a tabela não existe (P2021)', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2021', clientVersion: 't' });
    const s = make({ findUnique: jest.fn().mockRejectedValue(err) });
    expect(await s.get(u('administrador'))).toEqual({ data: META_PADRAO });
  });

  it('GET propaga outros erros', async () => {
    const s = make({ findUnique: jest.fn().mockRejectedValue(new Error('boom')) });
    await expect(s.get(u('ilm'))).rejects.toThrow('boom');
  });

  it('PUT nega não-admin', async () => {
    await expect(make({}).update(u('secretaria'), body)).rejects.toThrow(ForbiddenException);
  });

  it.each([
    { meta_semanal: 25, limite_verde: 12, limite_amarelo: 12 },
    { meta_semanal: 10, limite_verde: 18, limite_amarelo: 12 },
  ])('PUT rejeita limites incoerentes %j', async (b) => {
    await expect(make({}).update(u('ilm'), b)).rejects.toThrow(BadRequestException);
  });

  it('PUT faz upsert id=true com updated_by', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const r = await make({ upsert }).update(u('ilm'), body);
    expect(upsert.mock.calls[0][0]).toMatchObject({ where: { id: true }, update: { ...body, updated_by: 'u1' } });
    expect(r).toEqual({ data: body });
  });
});
