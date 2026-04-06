import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// Each resultado row — aluno_id + assessment fields (all optional except aluno_id)
// The assessment fields are passed through as-is to the DB function
export class ResultadoRowDto {
  @ApiProperty()
  @IsUUID()
  aluno_id!: string;

  // All assessment columns are dynamic — passed as JSON to the RPC
  [key: string]: unknown;
}

export class UpsertBatchDto {
  @ApiProperty()
  @IsUUID()
  avaliacao_id!: string;

  @ApiProperty()
  @IsUUID()
  turma_id!: string;

  @ApiProperty({ type: [Object] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  resultados!: Record<string, unknown>[];
}
