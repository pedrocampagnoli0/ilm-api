import { PartialType } from '@nestjs/swagger';
import { CreateEscolaDto } from './create-escola.dto.js';

export class UpdateEscolaDto extends PartialType(CreateEscolaDto) {}