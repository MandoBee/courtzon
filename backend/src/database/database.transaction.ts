import { PoolConnection } from 'mysql2/promise';

import { getPool } from './mysql.js';

export async function withTransaction<T>(
  callback: (
    connection: PoolConnection,
  ) => Promise<T>,
): Promise<T> {
  const connection =
    await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const result =
      await callback(connection);

    await connection.commit();

    return result;
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}