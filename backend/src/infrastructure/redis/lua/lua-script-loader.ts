import fs from "node:fs/promises";
import path from "node:path";

import type { Redis } from "ioredis";

import type { LoadedLuaScript } from "./lua-script.types.js";

export class LuaScriptLoader {
  constructor(private readonly redis: Redis) {}

  public async loadScript(
    scriptName: string,
  ): Promise<LoadedLuaScript> {
    const scriptPath = path.resolve(
      process.cwd(),
      "src/infrastructure/redis/lua/scripts",
      scriptName,
    );

    const scriptContent = await fs.readFile(
      scriptPath,
      "utf-8",
    );

    const sha = await this.redis.script(
      "LOAD",
      scriptContent,
    );

    return {
      name: scriptName,
      sha: String(sha),
    };
  }
}