import { PartialType } from '@nestjs/swagger';
import { CreateMunicipioDto } from './create-municipio.dto.js';

export class UpdateMunicipioDto extends PartialType(CreateMunicipioDto) {}
