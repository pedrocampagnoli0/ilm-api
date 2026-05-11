import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GrantImpersonatePermDto {
  @ApiProperty({
    description:
      'UUID do usuário (perfil administrador) que receberá a permissão de impersonate.',
  })
  @IsUUID('all')
  usuario_id!: string;
}
