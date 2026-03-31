import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Runtime: pooler (transaction mode)
    url: process.env['DATABASE_URL']!,
    // Direct: for db pull / migrations only (bypasses pooler)
    directUrl: process.env['DIRECT_URL'],
  },
});
