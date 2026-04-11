import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { DRIZZLE_DATABASE } from './database.constants';

let sqlClient: ReturnType<typeof postgres> | null = null;

@Injectable()
class DatabaseShutdown implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    if (sqlClient) {
      await sqlClient.end({ timeout: 5 });
      sqlClient = null;
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DATABASE,
      useFactory: (): PostgresJsDatabase<Record<string, never>> => {
        const url = process.env.SUDA_DATABASE_URL;
        if (!url) {
          throw new Error('SUDA_DATABASE_URL is required for database connection');
        }
        sqlClient = postgres(url, { max: 10 });
        return drizzle(sqlClient) as PostgresJsDatabase<Record<string, never>>;
      },
    },
    DatabaseShutdown,
  ],
  exports: [DRIZZLE_DATABASE],
})
export class DatabaseModule {}
