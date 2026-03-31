import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEscolaDto {
  @ApiProperty({ example: 'Escola Municipal São José' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(70)
  nome!: string;

  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  municipio_id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  coord_inf_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  coord_fund_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  diretor_id?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}