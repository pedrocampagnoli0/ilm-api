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
