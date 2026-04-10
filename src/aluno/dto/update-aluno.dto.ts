import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Alunos cannot change turma/escola/municipio — only their metadata
 * (nome, is_inclusao, is_transferido) can be updated.
 */
export class UpdateAlunoDto {
  @ApiPropertyOptional({ example: 'João Silva' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_inclusao?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_transferido?: boolean;
}
