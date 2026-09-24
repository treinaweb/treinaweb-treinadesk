import { SetMetadata } from '@nestjs/common';
import { Role } from '../generated/prisma/client.js';

export const ROLES_KEY = 'roles';

// Restringe a rota aos papéis informados; sem @Roles basta estar autenticado.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
