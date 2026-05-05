import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFeriadoDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nome!: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsDateString()
  data!: string;

  @ApiPropertyOptional({ description: 'Município-specific holiday — mutually exclusive with uf_sigla' })
  @ValidateIf((o) => !o.uf_sigla)
  @IsOptional()
  @IsUUID()
  municipio_id?: string;

  @ApiPropertyOptional({ description: 'State-wide holiday (UF sigla) — mutually exclusive with municipio_id' })
  @ValidateIf((o) => !o.municipio_id)
  @IsOptional()
  @IsString()
  @Length(2, 2)
  uf_sigla?: string;
}
