export type PerfilName =
  | 'administrador'
  | 'ilm'
  | 'secretaria'
  | 'diretor'
  | 'coordenacao'
  | 'professor';

export interface AuthenticatedUser {
  id: string; // usuario.id
  authUserId: string; // auth.users.id (from JWT sub)
  nome: string;
  email: string;
  perfil: PerfilName;
  municipioId: string | null;
  escolaIds: string[]; // escola IDs this user can access (via diretor/coord/professor)
  turmaIds: string[]; // turma IDs for professors/auxiliars (direct assignment)
  /** Municípios this user covers as an assessora (only populated for ilm/administrador). Empty = no Painel access. */
  assessoraMunicipioIds: string[];
  ativo: boolean;
}
