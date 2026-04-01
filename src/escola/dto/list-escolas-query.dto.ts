import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListEscolasQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by municipio UUID' })
  @IsOptional()
  @IsUUID()
  municipio_id?: string;

  @ApiPropertyOptional({ description: 'Filter by ativo (true/false/all)', example: 'true' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  ativo?: boolean;

  @ApiPropertyOptional({ description: 'Search by nome (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by coord_inf_id (coordinator infantil)' })
  @IsOptional()
  @IsUUID()
  coord_inf_id?: string;

  @ApiPropertyOptional({ description: 'Filter by coord_fund_id (coordinator fundamental)' })
  @IsOptional()
  @IsUUID()
  coord_fund_id?: string;

  @ApiPropertyOptional({ description: 'Filter by diretor_id' })
  @IsOptional()
  @IsUUID()
  diretor_id?: string;

  @ApiPropertyOptional({ description: 'Filter by multiple IDs (comma-separated UUIDs)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ids?: string;
}
