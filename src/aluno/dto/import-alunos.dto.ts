import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ImportAlunoRowDto {
  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nome!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  inclusao?: boolean;
}

export class ImportAlunosDto {
  @ApiProperty({ type: [ImportAlunoRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportAlunoRowDto)
  rows!: ImportAlunoRowDto[];

  @ApiProperty()
  @IsUUID()
  municipio_id!: string;

  @ApiProperty()
  @IsUUID()
  turma_id!: string;

  @ApiPropertyOptional({ description: 'Batch ID for bulk import tracking' })
  @IsOptional()
  @IsUUID()
  batch_id?: string;
}
