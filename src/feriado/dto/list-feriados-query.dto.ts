import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListFeriadosQueryDto {
  @ApiPropertyOptional({ description: 'Year (e.g. 2026). Returns all if absent.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  ano?: number;

  @ApiPropertyOptional({ description: 'When set, returns nacional + UF-of-município + município-specific.' })
  @IsOptional()
  @IsUUID()
  municipio_id?: string;
}
