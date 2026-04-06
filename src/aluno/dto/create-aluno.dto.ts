import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({ example: 'uuid' })
  @IsOptional()
  @IsUUID()
  escola_id?: string | null;

  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  municipio_id!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_inclusao?: boolean;
}
