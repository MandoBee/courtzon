import type { Command, CommandHandler } from '../command/command-base.js';

const registry = new Map<string, CommandHandler<Command, any>>();

export function registerCommandHandler(commandType: string, handler: CommandHandler<Command, any>): void {
  registry.set(commandType, handler);
}

export function getCommandHandler(commandType: string): CommandHandler<Command, any> | undefined {
  return registry.get(commandType);
}
