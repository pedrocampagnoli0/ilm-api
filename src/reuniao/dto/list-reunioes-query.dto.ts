import { IsBoolean, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListReunioesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  municipio_id?: string;

  @ApiPropertyOptional({ description: 'ISO start of window (inclusive)' })
  @IsOptional()
  @IsISO8601()
  inicio_de?: string;

  @ApiPropertyOptional({ description: 'ISO end of window (inclusive)' })
  @IsOptional()
  @IsISO8601()
  inicio_ate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  serie_id?: string;

  @ApiPropertyOptional({ description: 'Include canceladas (default true)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  include_canceladas?: boolean;
}
