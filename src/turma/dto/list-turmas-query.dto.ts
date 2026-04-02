import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListTurmasQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by escola UUID' })
  @IsOptional()
  @IsUUID()
  escola_id?: string;

  @ApiPropertyOptional({ description: 'Filter by ciclo UUID' })
  @IsOptional()
  @IsUUID()
  ciclo_id?: string;

  @ApiPropertyOptional({ description: 'Filter by municipio UUID (filters via escola)' })
  @IsOptional()
  @IsUUID()
  municipio_id?: string;

  @ApiPropertyOptional({ description: 'Filter by professora UUID' })
  @IsOptional()
  @IsUUID()
  professora_id?: string;

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

  @ApiPropertyOptional({ description: 'Comma-separated escola IDs' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  escola_ids?: string;

  @ApiPropertyOptional({ description: 'Comma-separated turma IDs' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ids?: string;
}
