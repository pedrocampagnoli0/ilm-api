import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

const TIPOS_VALIDOS = [
  'escolha', 'beads', 'oral', 'figura', 'cloze', 'paragrafo', 'ppm', 'quiz', 'leitura',
  // 'letra'/'som' — nome/som de letra (blocos nome_letra/som_letra). Contam
  // para ei2_nomes_letras/ei2_sons_letras (ver scoring.ts); no 1º ano os
  // mesmos blocos existem mas não têm coluna — a resposta é aceita e só não
  // entra em nenhum cálculo (ver comentário "SEM_CAMPO" no domínio do front).
  'letra', 'som',
] as const;

export class RespostaItemDto {
  @ApiProperty()
  @IsString()
  bloco!: string;

  @ApiProperty()
  @IsString()
  item_key!: string;

  @ApiProperty({ enum: TIPOS_VALIDOS })
  @IsIn(TIPOS_VALIDOS)
  tipo!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  correta?: boolean;

  // Precisa de ALGUM decorator de validação, senão o ValidationPipe global
  // (whitelist + forbidNonWhitelisted, ver main.ts) descarta este campo antes
  // de chegar no service. O conteúdo interno (índice escolhido, nível
  // avaliado, palavras/tempo) continua livre — só o "é um objeto" é exigido.
  @ApiProperty({ description: 'Payload livre da resposta (índice escolhido, nível avaliado, palavras/tempo, etc.)' })
  @IsObject()
  valor!: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  tempo_ms?: number;
}

export class SalvarRespostasDto {
  @ApiProperty({ type: [RespostaItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RespostaItemDto)
  respostas!: RespostaItemDto[];
}
