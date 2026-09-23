import postgres, { type Sql } from 'postgres';

export type Db = Sql;

export function createDb(url: string): Db {
  return postgres(url, {
    max: 4,
    connect_timeout: 5,
    onnotice: () => {},
  });
}
