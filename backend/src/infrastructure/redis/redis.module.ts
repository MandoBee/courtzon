import {
  closeRedisClient,
  getRedisClient,
} from "./redis.client.js";

export const redisModule = {
  getRedisClient,
  closeRedisClient,
};