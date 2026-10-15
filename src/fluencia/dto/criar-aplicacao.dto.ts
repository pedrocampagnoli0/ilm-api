import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const MAX_ITENS = 200;

export class TarefaDto {
  @ApiProperty({ minimum: 1, maximum: MAX_ITENS })
  @IsInt({ message: 'total deve ser um inteiro' })
  @Min(1, { message: 'total deve ser maior que zero' })
  @Max(MAX_ITENS, { message: `total deve ser no máximo ${MAX_ITENS}` })
  total!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Posição do último item alcançado (<= total)',
  })
  @IsInt({ message: 'ultima deve ser um inteiro' })
  @Min(0, { message: 'ultima não pode ser negativa' })
  ultima!: number;

  @ApiProperty({
    type: [Number],
    description: 'Posições (1..ultima) marcadas como erro',
  })
  @IsArray({ message: 'erros deve ser uma lista' })
  @ArrayMaxSize(MAX_ITENS, { message: 'erros tem itens demais' })
  @IsInt({ each: true, message: 'cada erro deve ser um inteiro' })
  erros!: number[];
}

export class TextoDto extends TarefaDto {
  @ApiProperty({ minimum: 1, maximum: 60 })
  @IsInt({ message: 'segundos deve ser um inteiro' })
  @Min(1, { message: 'segundos deve ser de 1 a 60' })
  @Max(60, { message: 'segundos deve ser de 1 a 60' })
  segundos!: number;
}

export class CriarAplicacaoDto {
  @ApiProperty({
    description: 'UUID gerado pelo cliente (chave de idempotência)',
  })
  @IsUUID(undefined, { message: 'id inválido' })
  id!: string;

  @ApiProperty()
  @IsUUID(undefined, { message: 'aluno_id inválido' })
  aluno_id!: string;

  @ApiProperty({ minimum: 1, maximum: 20 })
  @IsInt({ message: 'forma_numero deve ser um inteiro' })
  @Min(1, { message: 'forma_numero deve ser de 1 a 20' })
  @Max(20, { message: 'forma_numero deve ser de 1 a 20' })
  forma_numero!: number;

  @ApiProperty()
  @IsDateString({}, { message: 'iniciada_em inválida' })
  iniciada_em!: string;

  @ApiProperty()
  @IsDateString({}, { message: 'concluida_em inválida' })
  concluida_em!: string;

  @ApiProperty({ type: TarefaDto })
  @ValidateNested()
  @Type(() => TarefaDto)
  pseudopalavras!: TarefaDto;

  @ApiProperty({ type: TarefaDto })
  @ValidateNested()
  @Type(() => TarefaDto)
  palavras!: TarefaDto;

  @ApiProperty({ type: TextoDto })
  @ValidateNested()
  @Type(() => TextoDto)
  texto!: TextoDto;

  @ApiProperty({ enum: [1, 2, 3] })
  @IsInt({ message: 'prosodia deve ser 1, 2 ou 3' })
  @Min(1, { message: 'prosodia deve ser 1, 2 ou 3' })
  @Max(3, { message: 'prosodia deve ser 1, 2 ou 3' })
  prosodia!: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString({ message: 'observacao deve ser texto' })
  @MaxLength(1000, { message: 'observacao deve ter no máximo 1000 caracteres' })
  observacao?: string;
}
