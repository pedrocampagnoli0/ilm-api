import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by email (case-insensitive partial match)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ description: 'Filter by resultado (sucesso/falha)' })
  @IsOptional()
  @IsEnum(['sucesso', 'falha'])
  resultado?: 'sucesso' | 'falha';

  @ApiPropertyOptional({ description: 'Filter by date range start (ISO string)' })
  @IsOptional()
  @IsString()
  date_from?: string;

  @ApiPropertyOptional({ description: 'Filter by date range end (ISO string)' })
  @IsOptional()
  @IsString()
  date_to?: string;

  @ApiPropertyOptional({ description: 'Filter by municipio_id (resolves via usuario email)' })
  @IsOptional()
  @IsString()
  municipio_id?: string;

  @ApiPropertyOptional({ description: 'Filter by usuario nome (case-insensitive partial match)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;
}
