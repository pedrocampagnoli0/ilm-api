import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListRankingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  municipio_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  escola_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ciclo_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tipo_avaliacao_id?: string;

  @ApiPropertyOptional({ description: 'Filter by data_referencia (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  data_referencia?: string;
}
