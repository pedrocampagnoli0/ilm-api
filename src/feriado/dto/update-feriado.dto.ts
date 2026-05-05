import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFeriadoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  data?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  municipio_id?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 2)
  uf_sigla?: string | null;
}
