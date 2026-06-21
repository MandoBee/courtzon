export interface RedisHealthStatus {
  connected: boolean;
}

export interface LuaScriptDefinition {
  name: string;
  script: string;
}