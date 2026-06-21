export interface TimeSlot {
  start: string;
  end: string;
  dayOffset: number;
}

export class SlotGenerator {
  generate(startTime: string, endTime: string, durationMinutes: number): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMin = startH * 60 + startM;
    let end = endH * 60 + endM;

    if (end < startMin) {
      end += 1440;
    }

    let current = startMin;

    while (current + durationMinutes <= end) {
      const dayOffset = Math.floor(current / 1440);
      const slotStartH = Math.floor(current / 60) % 24;
      const slotStartM = current % 60;
      const slotEnd = current + durationMinutes;
      const slotEndH = Math.floor(slotEnd / 60) % 24;
      const slotEndM = slotEnd % 60;

      slots.push({
        start: `${String(slotStartH).padStart(2, '0')}:${String(slotStartM).padStart(2, '0')}`,
        end: `${String(slotEndH).padStart(2, '0')}:${String(slotEndM).padStart(2, '0')}`,
        dayOffset,
      });
      current = slotEnd;
    }

    return slots;
  }

  calculateTotalMinutes(startTime: string, endTime: string): number {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    let diff = (endH * 60 + endM) - (startH * 60 + startM);
    if (diff < 0) diff += 1440;
    return diff;
  }
}

export const slotGenerator = new SlotGenerator();
