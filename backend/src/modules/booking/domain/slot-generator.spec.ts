import { describe, it, expect } from 'vitest';
import { SlotGenerator } from './slot-generator.js';

const gen = new SlotGenerator();

describe('SlotGenerator.generate', () => {
  it('should generate 60-min slots from 08:00 to 10:00', () => {
    const slots = gen.generate('08:00', '10:00', 60);
    expect(slots).toEqual([
      { start: '08:00', end: '09:00', dayOffset: 0 },
      { start: '09:00', end: '10:00', dayOffset: 0 },
    ]);
  });

  it('should generate 30-min slots from 09:00 to 10:30', () => {
    const slots = gen.generate('09:00', '10:30', 30);
    expect(slots).toEqual([
      { start: '09:00', end: '09:30', dayOffset: 0 },
      { start: '09:30', end: '10:00', dayOffset: 0 },
      { start: '10:00', end: '10:30', dayOffset: 0 },
    ]);
  });

  it('should return empty when duration exceeds window', () => {
    const slots = gen.generate('09:00', '09:30', 60);
    expect(slots).toEqual([]);
  });

  it('should return empty when start equals end', () => {
    const slots = gen.generate('10:00', '10:00', 30);
    expect(slots).toEqual([]);
  });

  it('should generate single slot when exact fit', () => {
    const slots = gen.generate('14:00', '15:00', 60);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toEqual({ start: '14:00', end: '15:00', dayOffset: 0 });
  });

  it('should generate 60-min overnight slots (23:00 to 01:00 next day)', () => {
    const slots = gen.generate('23:00', '01:00', 60);
    expect(slots).toEqual([
      { start: '23:00', end: '00:00', dayOffset: 0 },
      { start: '00:00', end: '01:00', dayOffset: 1 },
    ]);
  });

  it('should generate 60-min overnight slots (22:00 to 02:00 next day)', () => {
    const slots = gen.generate('22:00', '02:00', 60);
    expect(slots).toEqual([
      { start: '22:00', end: '23:00', dayOffset: 0 },
      { start: '23:00', end: '00:00', dayOffset: 0 },
      { start: '00:00', end: '01:00', dayOffset: 1 },
      { start: '01:00', end: '02:00', dayOffset: 1 },
    ]);
  });

  it('should generate 30-min overnight slots (23:30 to 00:30 next day)', () => {
    const slots = gen.generate('23:30', '00:30', 30);
    expect(slots).toEqual([
      { start: '23:30', end: '00:00', dayOffset: 0 },
      { start: '00:00', end: '00:30', dayOffset: 1 },
    ]);
  });
});

describe('SlotGenerator.calculateTotalMinutes', () => {
  it('should calculate 60 minutes', () => {
    expect(gen.calculateTotalMinutes('09:00', '10:00')).toBe(60);
  });

  it('should calculate 90 minutes', () => {
    expect(gen.calculateTotalMinutes('09:00', '10:30')).toBe(90);
  });

  it('should calculate 0 minutes for same time', () => {
    expect(gen.calculateTotalMinutes('10:00', '10:00')).toBe(0);
  });

  it('should calculate 120 minutes for overnight (23:00 to 01:00)', () => {
    expect(gen.calculateTotalMinutes('23:00', '01:00')).toBe(120);
  });

  it('should calculate 240 minutes for overnight (22:00 to 02:00)', () => {
    expect(gen.calculateTotalMinutes('22:00', '02:00')).toBe(240);
  });
});
