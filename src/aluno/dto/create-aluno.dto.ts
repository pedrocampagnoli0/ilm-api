import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * escola_id is NOT accepted — it's always derived from the turma's escola_id
 * to guarantee aluno.escola_id is in sync with turma.escola_id.
 */
export class CreateAlunoDto {
  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  nome!: string;

  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  turma_id!: string;

  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  municipio_id!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_inclusao?: boolean;
}
