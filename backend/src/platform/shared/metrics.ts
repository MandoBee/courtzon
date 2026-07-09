export type MetricUnit = 'total' | 'duration_seconds' | 'count' | 'bytes' | 'percent';

export interface MetricLabel {
  name: string;
  values: string[];
}

export interface CounterConfig {
  name: string;
  help: string;
  labelNames?: string[];
}

export interface HistogramConfig {
  name: string;
  help: string;
  labelNames?: string[];
  buckets?: number[];
}

export interface GaugeConfig {
  name: string;
  help: string;
  labelNames?: string[];
}

export function platformMetricName(platform: string, metric: string): string {
  return `platform_${platform}_${metric}`;
}

export function platformRequestDurationName(platform: string): string {
  return platformMetricName(platform, 'request_duration_seconds');
}

export function platformRequestTotalName(platform: string): string {
  return platformMetricName(platform, 'requests_total');
}

export function platformErrorTotalName(platform: string): string {
  return platformMetricName(platform, 'errors_total');
}
