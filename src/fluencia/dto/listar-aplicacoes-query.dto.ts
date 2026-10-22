import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Informe `turma_ids` (relatório) e/ou `aluno_id` (formas já aplicadas). */
export class ListarAplicacoesQueryDto {
  @ApiPropertyOptional({
    description: 'IDs de turma separados por vírgula (relatório de fluência)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  turma_ids?: string;

  @ApiPropertyOptional({ description: 'ID do aluno (formas já aplicadas)' })
  @IsOptional()
  @IsUUID()
  aluno_id?: string;
}
