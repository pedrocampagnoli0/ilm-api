import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListAvaliacoesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by municipio UUID' })
  @IsOptional()
  @IsUUID()
  municipio_id?: string;

  @ApiPropertyOptional({ description: 'Filter by tipo_avaliacao UUID' })
  @IsOptional()
  @IsUUID()
  tipo_id?: string;

  @ApiPropertyOptional({ description: 'Filter by ativo' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  ativo?: boolean;

  @ApiPropertyOptional({ description: 'Filter by year (data_inicio)' })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  ano?: string;
}
