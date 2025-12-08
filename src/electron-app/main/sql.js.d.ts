/**
 * Type declarations for sql.js
 * https://github.com/sql-js/sql.js/
 */

declare module 'sql.js' {
  export interface Statement {
    bind(values?: any[]): boolean;
    step(): boolean;
    get(params?: any[]): any[];
    getColumnNames(): string[];
    getAsObject(params?: any[]): any;
    run(values?: any[]): void;
    reset(): void;
    free(): boolean;
  }

  export interface Database {
    run(sql: string, params?: any[]): void;
    exec(sql: string, params?: any[]): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
    create_function(name: string, func: Function): void;
  }

  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface SqlJsStatic {
    Database: {
      new(): Database;
      new(data: ArrayLike<number>): Database;
    };
  }

  export interface InitSqlJsOptions {
    locateFile?: (filename: string) => string;
  }

  export default function initSqlJs(config?: InitSqlJsOptions): Promise<SqlJsStatic>;
}
