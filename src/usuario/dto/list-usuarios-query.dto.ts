import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListUsuariosQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by perfil UUID' })
  @IsOptional()
  @IsUUID()
  perfil_id?: string;

  @ApiPropertyOptional({ description: 'Filter by municipio UUID' })
  @IsOptional()
  @IsUUID()
  municipio_id?: string;

  @ApiPropertyOptional({ description: 'Filter by ativo (true/false)' })
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

  @ApiPropertyOptional({ description: 'Search by email (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search_email?: string;

  @ApiPropertyOptional({ description: 'Comma-separated usuario IDs' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  ids?: string;
}
