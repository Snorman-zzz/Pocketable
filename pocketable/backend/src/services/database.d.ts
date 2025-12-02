import { Pool, PoolClient, QueryResult } from 'pg';
declare class DatabaseService {
    private pool;
    initialize(): void;
    getPool(): Pool;
    query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
    getClient(): Promise<PoolClient>;
    transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
    isAvailable(): boolean;
    runMigrations(): Promise<void>;
    close(): Promise<void>;
}
export declare const databaseService: DatabaseService;
export {};
//# sourceMappingURL=database.d.ts.map