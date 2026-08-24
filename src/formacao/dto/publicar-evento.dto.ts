import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PublicarEventoDto {
  @ApiProperty({
    description:
      'true publica o evento no site, false despublica. Só eventos publicados entram em /publico/eventos.',
  })
  @IsBoolean()
  publicado!: boolean;
}
