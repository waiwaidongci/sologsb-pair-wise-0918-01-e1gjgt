import type { FillMode, FillOrder } from "./types";

/** 固定充填位：每个位置同时只承接一项未完工气瓶 */
export const FILL_STATIONS = [
  { id: "S1", name: "充填位 1 号" },
  { id: "S2", name: "充填位 2 号" },
  { id: "S3", name: "充填位 3 号" },
];

export const FILL_MODES: FillMode[] = ["空气", "高氧 EAN", "Trimix"];

/** 收尾判定区间 */
export const TOL = {
  pressure: 10, // 实测压力允许 ±10 bar
  o2: 1, // O2 允许 ±1 个百分点
  he: 1, // He 允许 ±1 个百分点
};

export const INSPECT_WARN_DAYS = 30; // 检验临近提醒

export const STORAGE_KEY = "dive-fill-station-v1";

/** 默认目标参数与混合气提示 */
export function modeDefaults(mode: FillMode): { o2: number; he: number; hint: string } {
  switch (mode) {
    case "空气":
      return { o2: 21, he: 0, hint: "空气充填：O₂ 约 20.9%，He 0%，目标压力 200bar 起" };
    case "高氧 EAN":
      return { o2: 32, he: 0, hint: "高氧 EAN32：O₂ 32% / He 0%，注意氧暴露与限深" };
    case "Trimix":
      return { o2: 18, he: 35, hint: "Trimix 18/35：O₂ 18% / He 35%，其余为氮平衡" };
  }
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 检验是否已过期（过期当天即算过期，只能进入送检区） */
export function isInspectionExpired(dateStr: string, now = new Date()): boolean {
  const d = new Date(dateStr + "T23:59:59");
  return d.getTime() < now.getTime();
}

export function daysUntil(dateStr: string, now = new Date()): number {
  const d = new Date(dateStr + "T00:00:00");
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((d.getTime() - base) / 86400000);
}

export function inspectLabel(dateStr: string): { text: string; tone: "ok" | "warn" | "expired" } {
  const days = daysUntil(dateStr);
  if (days < 0) return { text: `已过期 ${-days} 天`, tone: "expired" };
  if (days <= INSPECT_WARN_DAYS) return { text: `剩余 ${days} 天`, tone: "warn" };
  return { text: `剩余 ${days} 天`, tone: "ok" };
}

export interface MeasureCheck {
  pressureOk: boolean;
  o2Ok: boolean;
  heOk: boolean;
  deviations: string[];
  passed: boolean;
}

/** 收尾 / 返工复核：任一项超出目标区间即不通过 */
export function checkMeasure(
  order: Pick<FillOrder, "targetPressure" | "targetO2" | "targetHe">,
  m: { pressure: number; o2: number; he: number }
): MeasureCheck {
  const deviations: string[] = [];
  const pressureOk = Math.abs(m.pressure - order.targetPressure) <= TOL.pressure;
  const o2Ok = Math.abs(m.o2 - order.targetO2) <= TOL.o2;
  const heOk = Math.abs(m.he - order.targetHe) <= TOL.he;
  if (!pressureOk)
    deviations.push(
      `实测压力 ${m.pressure}bar 超出目标 ${order.targetPressure}±${TOL.pressure}bar`
    );
  if (!o2Ok) deviations.push(`实测 O₂ ${m.o2}% 超出目标 ${order.targetO2}±${TOL.o2}%`);
  if (!heOk) deviations.push(`实测 He ${m.he}% 超出目标 ${order.targetHe}±${TOL.he}%`);
  return { pressureOk, o2Ok, heOk, deviations, passed: pressureOk && o2Ok && heOk };
}

export function rangeText(target: number, tol: number, unit: string): string {
  return `${target - tol} ~ ${target + tol} ${unit}`;
}

export function uid(prefix: string): string {
  return prefix + "-" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}
