import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListResultadosQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by avaliacao UUID' })
  @IsOptional()
  @IsUUID()
  avaliacao_id?: string;

  @ApiPropertyOptional({ description: 'Filter by turma UUID' })
  @IsOptional()
  @IsUUID()
  turma_id?: string;

  @ApiPropertyOptional({ description: 'Filter by aluno UUID' })
  @IsOptional()
  @IsUUID()
  aluno_id?: string;

  @ApiPropertyOptional({ description: 'Filter by ciclo UUID' })
  @IsOptional()
  @IsUUID()
  ciclo_id?: string;

  @ApiPropertyOptional({ description: 'Filter by ausente' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  ausente?: boolean;

  @ApiPropertyOptional({ description: 'Comma-separated avaliacao IDs' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  avaliacao_ids?: string;

  @ApiPropertyOptional({ description: 'Comma-separated aluno IDs' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aluno_ids?: string;
}
