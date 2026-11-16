import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProgressoTurmasDto {
  @ApiProperty({ type: [String], description: 'IDs das avaliações (máx. 200)' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  avaliacao_ids!: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Restringe a estas turmas (máx. 5000). Sem o campo: turmas ativas de escolas ativas que o usuário enxerga.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true })
  turma_ids?: string[];
}

export class ProgressoMunicipiosDto {
  @ApiProperty({ type: [String], description: 'IDs dos municípios (máx. 500)' })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  municipio_ids!: string[];

  @ApiPropertyOptional({
    description:
      'true = todas as avaliações de cada município; padrão = só a que representa o município hoje',
  })
  @IsOptional()
  @IsBoolean()
  historico?: boolean;
}
