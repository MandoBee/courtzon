export class TimezoneError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimezoneError'
  }
}

export class DSTGapError extends Error {
  constructor(localDate: string, localTime: string, timezone: string) {
    super(`Local time ${localDate}T${localTime} does not exist in ${timezone} (spring-forward gap)`)
    this.name = 'DSTGapError'
  }
}

export class AmbiguousTimeError extends Error {
  public readonly firstUtc: string
  public readonly secondUtc: string

  constructor(localDate: string, localTime: string, timezone: string, firstUtc: string, secondUtc: string) {
    super(
      `Local time ${localDate}T${localTime} is ambiguous in ${timezone} (fall-back overlap). ` +
      `Two UTC instants: ${firstUtc} and ${secondUtc}`
    )
    this.name = 'AmbiguousTimeError'
    this.firstUtc = firstUtc
    this.secondUtc = secondUtc
  }
}

export class InvalidSlotError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSlotError'
  }
}
