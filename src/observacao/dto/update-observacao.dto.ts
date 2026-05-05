import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateObservacaoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  usuario_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pessoa_nome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pessoa_perfil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  data?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  conteudo?: string;
}
