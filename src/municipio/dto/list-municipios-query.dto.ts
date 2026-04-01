import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListMunicipiosQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by UF sigla (e.g. SP, RJ)' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  uf_sigla?: string;

  @ApiPropertyOptional({ description: 'Filter by ativo (true/false/all)' })
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

  @ApiPropertyOptional({ description: 'Filter by multiple IDs (comma-separated UUIDs)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ids?: string;
}
