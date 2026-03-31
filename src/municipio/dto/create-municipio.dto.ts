import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMunicipioDto {
  @ApiProperty({ example: 'São Paulo' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(70)
  nome!: string;

  @ApiProperty({ example: 'SP', maxLength: 2 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(2)
  uf_sigla!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @ApiPropertyOptional({ description: 'Logo URL (set after upload)' })
  @IsOptional()
  @IsUrl({ require_tld: true, protocols: ['https'] })
  @MaxLength(500)
  logo_municipio_url?: string;
}
