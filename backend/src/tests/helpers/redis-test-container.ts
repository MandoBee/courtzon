import Redis from "ioredis";

export async function createRedisTestClient(): Promise<any> {
  const client = new (Redis as any)({
    host: "127.0.0.1",
    port: 6379,
  });

  await client.ping();

  return client;
}