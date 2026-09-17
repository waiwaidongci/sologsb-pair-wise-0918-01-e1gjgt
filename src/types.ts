export type FillMode = "空气" | "高氧 EAN" | "Trimix";
export type OrderStatus =
  | "queued" // 待充填队列（检验在有效期）
  | "inspection" // 送检区（检验过期，禁止进入充填位）
  | "filling" // 充填位作业中
  | "rework" // 返工
  | "delivered"; // 已交付（记录锁定）

export interface ParamLog {
  id: string;
  at: string; // ISO 时间
  operator: string;
  shiftSeq: number;
  pressure: number; // 当前压力 bar
  o2: number; // O2 %
  he: number; // He %
  note: string;
}

export interface CloseResult {
  at: string;
  operator: string;
  shiftSeq: number;
  pressure: number;
  o2: number;
  he: number;
  mode: FillMode;
  passed: boolean; // 是否全部落在目标区间
  deviation: string[]; // 超差项描述
}

export interface ReworkResult {
  at: string;
  reworker: string;
  reviewerSign: string; // 复核人签字
  pressure: number;
  o2: number;
  he: number;
  mode: FillMode;
  passed: boolean;
  deviation: string[];
}

export interface TimelineEvent {
  id: string;
  at: string;
  type:
    | "created"
    | "assigned"
    | "unassigned"
    | "param"
    | "passed_close"
    | "rework_close"
    | "rework_deliver"
    | "deliver"
    | "handover"
    | "inspection_return";
  text: string;
  operator: string;
  shiftSeq: number;
}

export interface FillOrder {
  id: string; // 充填单号
  tankNo: string; // 气瓶编号
  volume: string; // 容积
  inspectUntil: string; // 检验有效期 YYYY-MM-DD
  residualPressure: number; // 残压 bar
  targetPressure: number; // 目标压力 bar
  targetO2: number; // 目标 O2 %
  targetHe: number; // 目标 He %
  mode: FillMode; // 充填方式
  operator: string; // 接单操作员
  createdAt: string;
  status: OrderStatus;
  slotId: string | null; // 占用的充填位
  params: ParamLog[]; // 作业过程已录参数（随班次移交）
  close: CloseResult | null; // 收尾实测（锁定后不可补记）
  rework: ReworkResult | null;
  deliveredAt: string | null;
  timeline: TimelineEvent[];
}

export interface HandoverEvent {
  id: string;
  at: string;
  fromOperator: string;
  toOperator: string;
  shiftSeq: number; // 交接时的班次号（交班班次）
  summary: string;
}

export interface StationState {
  orders: FillOrder[];
  handovers: HandoverEvent[];
  shiftSeq: number; // 当前班次序号
  currentOperator: string | null; // 当前值班员
  shiftStartedAt: string | null;
  seq: number; // 单号计数器
}
