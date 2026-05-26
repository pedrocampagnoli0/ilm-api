import { IsBoolean, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListAlunosQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by turma UUID' })
  @IsOptional()
  @IsUUID()
  turma_id?: string;

  @ApiPropertyOptional({ description: 'Filter by escola UUID' })
  @IsOptional()
  @IsUUID()
  escola_id?: string;

  @ApiPropertyOptional({ description: 'Filter by municipio UUID' })
  @IsOptional()
  @IsUUID()
  municipio_id?: string;

  @ApiPropertyOptional({ description: 'Filter by is_inclusao' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  is_inclusao?: boolean;

  @ApiPropertyOptional({ description: 'Filter by is_transferido' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  is_transferido?: boolean;

  @ApiPropertyOptional({ description: 'Search by nome (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Comma-separated aluno IDs' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  ids?: string;

  @ApiPropertyOptional({ description: 'Comma-separated turma IDs' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  turma_ids?: string;

  @ApiPropertyOptional({ description: 'Only alunos with created_at <= this ISO-8601 timestamp. Used to freeze stats for closed avaliações.' })
  @IsOptional()
  @IsISO8601()
  created_at_max?: string;
}
