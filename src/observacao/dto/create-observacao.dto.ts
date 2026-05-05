import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateObservacaoDto {
  @ApiProperty()
  @IsUUID()
  municipio_id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  usuario_id?: string;

  @ApiPropertyOptional({ description: 'Required when usuario_id is not set' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pessoa_nome?: string;

  @ApiPropertyOptional({ enum: ['coordenacao', 'diretor', 'professor', 'semed', 'outro'], description: 'Required when usuario_id is not set' })
  @IsOptional()
  @IsString()
  pessoa_perfil?: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsDateString()
  data!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  conteudo!: string;
}
