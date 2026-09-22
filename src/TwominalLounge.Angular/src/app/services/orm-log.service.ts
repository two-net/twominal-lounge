import { Injectable, signal } from '@angular/core';
import { OrmLogEntry } from '../models/lounge.models';

@Injectable({
  providedIn: 'root',
})
export class OrmLogService {
  public logs = signal<OrmLogEntry[]>([]);
  private readonly maxLogs = 50;

  constructor() {
    // Initial system boot telemetry logs
    this.log('DB_BOOT', 'Connecting PostgreSQL pool to host=postgres-cluster.twominal.internal');
    this.log('ORM_MIGRATE', 'Running auto_migrate: verified table lounges, rooms, room_layouts, whiteboard_notes');
    this.log('NO_PARTITION', 'Partitioning check disabled by static config specification');
  }

  log(action: string, payload: any): void {
    const timestamp = new Date().toISOString().substring(11, 23);
    const id = 'log-' + Math.random().toString(36).substring(2, 9);

    let colorClass = 'text-teal-400';
    if (action.includes('MIGRATE') || action.includes('BOOT') || action.includes('OK')) {
      colorClass = 'text-emerald-400';
    } else if (action.includes('PROXIMITY')) {
      colorClass = 'text-amber-300';
    } else if (action.includes('AUDIO') || action.includes('WEBCAM')) {
      colorClass = 'text-sky-300';
    } else if (action.includes('INSERT') || action.includes('POSTGRES')) {
      colorClass = 'text-indigo-300';
    } else if (action.includes('ZONE')) {
      colorClass = 'text-emerald-300';
    } else if (action.includes('EMOTE') || action.includes('INTERACT')) {
      colorClass = 'text-pink-400';
    }

    const entry: OrmLogEntry = {
      id,
      timestamp,
      action,
      payload: typeof payload === 'object' ? JSON.stringify(payload) : String(payload),
      colorClass,
    };

    this.logs.update((current) => [entry, ...current.slice(0, this.maxLogs - 1)]);
  }
}
