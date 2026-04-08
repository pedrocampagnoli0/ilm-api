import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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
  @MaxLength(5000)
  ids?: string;

  @ApiPropertyOptional({ description: 'Comma-separated turma IDs' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  turma_ids?: string;
}
