import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PorAvaliacaoQueryDto {
  @ApiProperty()
  @IsUUID()
  municipio_id!: string;

  @ApiProperty()
  @IsUUID()
  ciclo_id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  escola_id?: string;

  @ApiPropertyOptional({ description: 'Ano letivo (default: ano corrente)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  ano?: number;
}
