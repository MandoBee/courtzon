import type { Server as SocketIOServer } from 'socket.io';
import {
  userRoom, orgRoom, branchRoom, ADMIN_ROOM, PLAYER_ROOM,
} from './room.js';

class RealtimeService {
  private io: SocketIOServer | null = null;

  initialize(server: SocketIOServer): void {
    this.io = server;
  }

  private getIO(): SocketIOServer {
    if (!this.io) {
      throw new Error('RealtimeService not initialized. Call initialize() first.');
    }
    return this.io;
  }

  emitToUser(userId: number, event: string, data?: any): void {
    this.getIO().to(userRoom(userId)).emit(event, data);
  }

  emitToRoom(roomName: string, event: string, data?: any): void {
    this.getIO().to(roomName).emit(event, data);
  }

  emitToOrg(orgId: number, event: string, data?: any): void {
    this.getIO().to(orgRoom(orgId)).emit(event, data);
  }

  emitToRole(role: string, event: string, data?: any): void {
    this.getIO().to(`role:${role}`).emit(event, data);
  }

  emitToAll(event: string, data?: any): void {
    this.getIO().emit(event, data);
  }

  broadcastToAdmins(event: string, data?: any): void {
    this.getIO().to(ADMIN_ROOM).emit(event, data);
  }

  emitToBranch(branchId: number, event: string, data?: any): void {
    this.getIO().to(branchRoom(branchId)).emit(event, data);
  }

  emitToPlayers(event: string, data?: any): void {
    this.getIO().to(PLAYER_ROOM).emit(event, data);
  }
}

export const realtimeService = new RealtimeService();
