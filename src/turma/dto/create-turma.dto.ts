import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTurmaDto {
  @ApiProperty({ example: 'Turma A - Manhã' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(40)
  nome!: string;

  @ApiProperty({ description: 'School UUID' })
  @IsUUID()
  escola_id!: string;

  @ApiProperty({ description: 'Grade cycle UUID' })
  @IsUUID()
  ciclo_id!: string;

  @ApiProperty({ description: 'Main teacher UUID' })
  @IsUUID()
  professora_id!: string;

  @ApiPropertyOptional({ description: 'Assistant teacher UUID' })
  @IsOptional()
  @IsUUID()
  auxiliar_id?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
