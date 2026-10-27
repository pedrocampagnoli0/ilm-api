import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUsuarioDto {
  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  nome!: string;

  @ApiProperty({ example: 'maria@exemplo.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  perfil_id!: string;

  @ApiPropertyOptional({ example: 'uuid' })
  @IsOptional()
  @IsUUID()
  municipio_id?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @ApiPropertyOptional({ enum: ['P', 'M', 'G', 'GG'] })
  @IsOptional()
  @IsEnum(['P', 'M', 'G', 'GG'], { message: 'tamanho_camiseta deve ser P, M, G ou GG' })
  tamanho_camiseta?: 'P' | 'M' | 'G' | 'GG' | null;

  @ApiPropertyOptional({ example: '11912345678', description: 'WhatsApp/telefone com DDD. Apenas dígitos.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefone?: string | null;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Último dia de acesso (perfil visitante). NULL = sem validade.' })
  @IsOptional()
  @IsDateString()
  valido_ate?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Chaves dos flipbooks liberados (perfil visitante).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  flipbooks?: string[] | null;
}
