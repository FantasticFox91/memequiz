import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// локально .env лежит в корне монорепо; в Docker DATABASE_URL приходит из compose
config({ path: ['.env', '../../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // не env(): он падает без переменной, а `prisma generate` при сборке образа БД не нужна
    url: process.env.DATABASE_URL ?? '',
  },
});
