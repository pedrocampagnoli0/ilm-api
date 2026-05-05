import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContatoPrincipalDto {
  @ApiProperty()
  @IsUUID()
  municipio_id!: string;

  @ApiPropertyOptional({ description: 'Portal user ID (optional — external contacts allowed)' })
  @IsOptional()
  @IsUUID()
  usuario_id?: string;

  @ApiPropertyOptional({ description: 'Required when usuario_id is not set' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string;

  @ApiPropertyOptional({ enum: ['coordenacao', 'diretor', 'professor', 'semed', 'outro'], description: 'Required when usuario_id is not set' })
  @IsOptional()
  @IsString()
  perfil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cargo?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  ordem?: number;
}
