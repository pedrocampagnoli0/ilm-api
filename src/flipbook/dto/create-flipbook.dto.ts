import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFlipbookDto {
  @ApiProperty({ example: 'Livro Pré 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titulo!: string;

  @ApiProperty({
    example: 'https://heyzine.com/flip-book/78318c4324.html',
    description: 'src do iframe (apenas a URL https, não o HTML do embed).',
  })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  url!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
