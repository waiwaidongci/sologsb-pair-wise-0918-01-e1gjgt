// 潜水店值班充填台：状态模型与业务规则
// 规则要点：
// 1. 登记时按检验有效期分流，过期气瓶只进送检区，不能占用充填位；
// 2. 每个充填位同时只承接一项未完工气瓶；
// 3. 换班时在制作业连同已录参数交接给下一班，交接不关闭作业；
// 4. 收尾必须填写实测压力 / O₂ / He / 充填方式，任一项超出目标区间即返工；
// 5. 返工后合格需复核签字才可交付；已交付记录关闭，不可再补记。

export type FillMethod = "空气" | "高氧" | "Trimix";

export type JobStatus =
  | "queued" // 待充填队列
  | "filling" // 充填中（占用充填位）
  | "rework" // 返工中（仍占用充填位）
  | "awaiting_signoff" // 收尾合格，待签收
  | "awaiting_review" // 返工后合格，待复核签字
  | "delivered" // 已交付（关闭，只读）
  | "inspection"; // 送检区（检验过期）

export interface FinalReading {
  pressure: number; // 实测压力 bar
  o2: number; // 实测氧含量 %
  he: number; // 实测氦含量 %
  method: FillMethod; // 实际充填方式
}

export type EventType =
  | "register_queue"
  | "register_inspection"
  | "to_inspection"
  | "assign"
  | "param"
  | "handover"
  | "finish_ok"
  | "finish_fail"
  | "signoff"
  | "review";

export interface JobEvent {
  at: number;
  type: EventType;
  by: string;
  note: string;
}

export interface Job {
  id: string; // 气瓶编号
  volume: string; // 容积
  inspectionExpiry: string; // 检验有效期 yyyy-mm-dd
  residualPressure: number; // 残压 bar
  targetPressure: number; // 目标压力 bar
  targetO2: number; // 目标氧含量 %
  targetHe: number; // 目标氦含量 %
  method: FillMethod; // 计划充填方式
  status: JobStatus;
  operator: string; // 当前负责操作员
  draft: Partial<FinalReading>; // 充填过程中已录参数（换班随作业交接）
  final?: FinalReading; // 最近一次收尾实测
  reworkCount: number;
  lastIssues: string[]; // 最近一次收尾超差项
  createdAt: number;
  events: JobEvent[];
}

export interface State {
  dutyOperator: string; // 当前值班员
  slots: (string | null)[]; // 充填位，一位一项未完工气瓶
  jobs: Record<string, Job>;
}

export const SLOT_COUNT = 3;
export const TOLERANCE = { pressure: 10, o2: 1, he: 1 } as const;
export const FILL_METHODS: FillMethod[] = ["空气", "高氧", "Trimix"];
export const STORAGE_KEY = "hxyfront-62010-fill-station-v1";

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "待充填",
  filling: "充填中",
  rework: "返工中",
  awaiting_signoff: "待签收",
  awaiting_review: "待复核",
  delivered: "已交付",
  inspection: "送检区",
};

export const EVENT_LABEL: Record<EventType, string> = {
  register_queue: "登记入队",
  register_inspection: "分流送检",
  to_inspection: "转送检区",
  assign: "上充填位",
  param: "录入参数",
  handover: "换班交接",
  finish_ok: "收尾合格",
  finish_fail: "收尾超差",
  signoff: "签收交付",
  review: "复核签字",
};

// ---------- 日期工具 ----------

export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, (m || 1) - 1, d || 1).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86400000);
}

export function isExpired(dateStr: string): boolean {
  return daysUntil(dateStr) < 0;
}

export function fmtTime(at: number): string {
  const d = new Date(at);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

// ---------- 业务规则 ----------

/** 收尾实测是否超出目标区间，返回超差项描述（空数组 = 合格） */
export function outOfRange(job: Job, r: FinalReading): string[] {
  const issues: string[] = [];
  if (Math.abs(r.pressure - job.targetPressure) > TOLERANCE.pressure) {
    issues.push(`实测压力 ${r.pressure}bar 超出 ${job.targetPressure}±${TOLERANCE.pressure}bar`);
  }
  if (Math.abs(r.o2 - job.targetO2) > TOLERANCE.o2) {
    issues.push(`O₂ ${r.o2}% 超出 ${job.targetO2}±${TOLERANCE.o2}%`);
  }
  if (Math.abs(r.he - job.targetHe) > TOLERANCE.he) {
    issues.push(`He ${r.he}% 超出 ${job.targetHe}±${TOLERANCE.he}%`);
  }
  if (r.method !== job.method) {
    issues.push(`充填方式 ${r.method} 与计划 ${job.method} 不一致`);
  }
  return issues;
}

/** 混合气比例提示 */
export function mixLabel(o2: number, he: number): string {
  if (he > 0) return `Trimix ${o2}/${he}`;
  if (o2 > 21.4) return `高氧 EAN${o2}`;
  return "压缩空气";
}

/** 按 PPO₂ 1.4 估算最大作业深度 */
export function modHint(o2: number): string {
  if (!(o2 > 0) || o2 >= 100) return "";
  const mod = Math.floor(10 * (1.4 / (o2 / 100) - 1));
  return mod > 0 ? `MOD(PPO₂1.4)≈${mod}m` : "";
}

export function summarizeDraft(d: Partial<FinalReading>): string {
  const parts: string[] = [];
  if (d.pressure != null) parts.push(`压力 ${d.pressure}bar`);
  if (d.o2 != null) parts.push(`O₂ ${d.o2}%`);
  if (d.he != null) parts.push(`He ${d.he}%`);
  if (d.method) parts.push(`方式 ${d.method}`);
  return parts.length ? parts.join("，") : "暂无";
}

export function readingText(r: FinalReading): string {
  return `实测 ${r.pressure}bar / O₂ ${r.o2}% / He ${r.he}% / ${r.method}`;
}

// ---------- Reducer ----------

export interface RegisterInput {
  id: string;
  volume: string;
  inspectionExpiry: string;
  residualPressure: number;
  targetPressure: number;
  targetO2: number;
  targetHe: number;
  method: FillMethod;
}

export type Action =
  | { type: "register"; input: RegisterInput; by: string }
  | { type: "assign"; id: string; by: string }
  | { type: "toInspection"; id: string; by: string }
  | { type: "record"; id: string; draft: Partial<FinalReading>; by: string }
  | { type: "finish"; id: string; reading: FinalReading; by: string }
  | { type: "signoff"; id: string; by: string }
  | { type: "review"; id: string; by: string }
  | { type: "handover"; to: string; by: string }
  | { type: "reset" };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "register": {
      const input = action.input;
      const id = input.id.trim();
      if (!id || state.jobs[id]) return state;
      const at = Date.now();
      const expired = isExpired(input.inspectionExpiry);
      const job: Job = {
        id,
        volume: input.volume,
        inspectionExpiry: input.inspectionExpiry,
        residualPressure: input.residualPressure,
        targetPressure: input.targetPressure,
        targetO2: input.targetO2,
        targetHe: input.targetHe,
        method: input.method,
        status: expired ? "inspection" : "queued",
        operator: action.by,
        draft: {},
        reworkCount: 0,
        lastIssues: [],
        createdAt: at,
        events: [
          {
            at,
            by: action.by,
            type: expired ? "register_inspection" : "register_queue",
            note: expired
              ? `检验有效期 ${input.inspectionExpiry} 已过期，分流至送检区，不占用充填位`
              : `登记入队：残压 ${input.residualPressure}bar，目标 ${input.targetPressure}bar / O₂ ${input.targetO2}% / He ${input.targetHe}% / ${input.method}`,
          },
        ],
      };
      return { ...state, jobs: { ...state.jobs, [id]: job } };
    }

    case "assign": {
      const job = state.jobs[action.id];
      // 只有在队且检验未过期的气瓶可上充填位；空位才允许接入
      if (!job || job.status !== "queued" || isExpired(job.inspectionExpiry)) return state;
      const idx = state.slots.indexOf(null);
      if (idx === -1) return state;
      const slots = [...state.slots];
      slots[idx] = job.id;
      const updated: Job = {
        ...job,
        status: "filling",
        operator: action.by,
        events: [
          ...job.events,
          { at: Date.now(), type: "assign", by: action.by, note: `接入充填位 #${idx + 1}` },
        ],
      };
      return { ...state, slots, jobs: { ...state.jobs, [job.id]: updated } };
    }

    case "toInspection": {
      const job = state.jobs[action.id];
      if (!job || job.status !== "queued") return state;
      const updated: Job = {
        ...job,
        status: "inspection",
        events: [
          ...job.events,
          {
            at: Date.now(),
            type: "to_inspection",
            by: action.by,
            note: `检验有效期 ${job.inspectionExpiry} 已过期，转出队列至送检区`,
          },
        ],
      };
      return { ...state, jobs: { ...state.jobs, [job.id]: updated } };
    }

    case "record": {
      const job = state.jobs[action.id];
      // 未完工（充填中/返工中）才允许补录参数
      if (!job || (job.status !== "filling" && job.status !== "rework")) return state;
      const draft = { ...job.draft, ...action.draft };
      const updated: Job = {
        ...job,
        draft,
        events: [
          ...job.events,
          { at: Date.now(), type: "param", by: action.by, note: `录入参数：${summarizeDraft(action.draft)}` },
        ],
      };
      return { ...state, jobs: { ...state.jobs, [job.id]: updated } };
    }

    case "finish": {
      const job = state.jobs[action.id];
      if (!job || (job.status !== "filling" && job.status !== "rework")) return state;
      const at = Date.now();
      const issues = outOfRange(job, action.reading);
      if (issues.length > 0) {
        // 任一项超出目标区间 → 返工，仍占用充填位
        const updated: Job = {
          ...job,
          status: "rework",
          final: action.reading,
          draft: {},
          reworkCount: job.reworkCount + 1,
          lastIssues: issues,
          events: [
            ...job.events,
            {
              at,
              type: "finish_fail",
              by: action.by,
              note: `收尾超差 → 返工（${readingText(action.reading)}）：${issues.join("；")}`,
            },
          ],
        };
        return { ...state, jobs: { ...state.jobs, [job.id]: updated } };
      }
      // 合格：释放充填位；有返工记录需复核签字，否则直接待签收
      const needsReview = job.reworkCount > 0;
      const updated: Job = {
        ...job,
        status: needsReview ? "awaiting_review" : "awaiting_signoff",
        final: action.reading,
        draft: {},
        lastIssues: [],
        events: [
          ...job.events,
          {
            at,
            type: "finish_ok",
            by: action.by,
            note: `收尾合格（${readingText(action.reading)}）${needsReview ? "，返工后合格，待复核签字" : "，待签收"}`,
          },
        ],
      };
      const slots = state.slots.map((s) => (s === job.id ? null : s));
      return { ...state, slots, jobs: { ...state.jobs, [job.id]: updated } };
    }

    case "signoff": {
      const job = state.jobs[action.id];
      if (!job || job.status !== "awaiting_signoff" || !action.by.trim()) return state;
      const updated: Job = {
        ...job,
        status: "delivered",
        events: [
          ...job.events,
          { at: Date.now(), type: "signoff", by: action.by, note: `签收交付：${action.by}` },
        ],
      };
      return { ...state, jobs: { ...state.jobs, [job.id]: updated } };
    }

    case "review": {
      const job = state.jobs[action.id];
      // 返工复核必须有人签字才可交付
      if (!job || job.status !== "awaiting_review" || !action.by.trim()) return state;
      const updated: Job = {
        ...job,
        status: "delivered",
        events: [
          ...job.events,
          { at: Date.now(), type: "review", by: action.by, note: `返工复核签字：${action.by}，准予交付` },
        ],
      };
      return { ...state, jobs: { ...state.jobs, [job.id]: updated } };
    }

    case "handover": {
      const to = action.to.trim();
      if (!to) return state;
      const at = Date.now();
      const jobs = { ...state.jobs };
      // 在制（未完工）作业连同已录参数交接，作业保持打开
      for (const job of Object.values(state.jobs)) {
        if (job.status === "filling" || job.status === "rework") {
          jobs[job.id] = {
            ...job,
            operator: to,
            events: [
              ...job.events,
              {
                at,
                type: "handover",
                by: action.by,
                note: `换班交接：${action.by} → ${to}；已录参数：${summarizeDraft(job.draft)}`,
              },
            ],
          };
        }
      }
      return { ...state, dutyOperator: to, jobs };
    }

    case "reset":
      return seedState();

    default:
      return state;
  }
}

// ---------- 演示数据 ----------

export function seedState(): State {
  const now = Date.now();
  const min = 60000;
  const day = 86400000;
  const datePlus = (days: number) => localDateStr(new Date(now + days * day));

  const jobs: Record<string, Job> = {
    "TANK-204": {
      id: "TANK-204",
      volume: "12L 铝瓶",
      inspectionExpiry: datePlus(200),
      residualPressure: 55,
      targetPressure: 200,
      targetO2: 20.9,
      targetHe: 0,
      method: "空气",
      status: "queued",
      operator: "阿豪",
      draft: {},
      reworkCount: 0,
      lastIssues: [],
      createdAt: now - 50 * min,
      events: [
        {
          at: now - 50 * min,
          type: "register_queue",
          by: "阿豪",
          note: "登记入队：残压 55bar，目标 200bar / O₂ 20.9% / He 0% / 空气",
        },
      ],
    },
    "TANK-219": {
      id: "TANK-219",
      volume: "11L 钢瓶",
      inspectionExpiry: datePlus(80),
      residualPressure: 30,
      targetPressure: 200,
      targetO2: 32,
      targetHe: 0,
      method: "高氧",
      status: "filling",
      operator: "阿豪",
      draft: { pressure: 120, o2: 31.8 },
      reworkCount: 0,
      lastIssues: [],
      createdAt: now - 90 * min,
      events: [
        {
          at: now - 90 * min,
          type: "register_queue",
          by: "阿豪",
          note: "登记入队：残压 30bar，目标 200bar / O₂ 32% / He 0% / 高氧",
        },
        { at: now - 80 * min, type: "assign", by: "阿豪", note: "接入充填位 #1" },
        { at: now - 30 * min, type: "param", by: "阿豪", note: "录入参数：压力 120bar，O₂ 31.8%" },
      ],
    },
    "TANK-231": {
      id: "TANK-231",
      volume: "双瓶组",
      inspectionExpiry: datePlus(12),
      residualPressure: 10,
      targetPressure: 200,
      targetO2: 21,
      targetHe: 35,
      method: "Trimix",
      status: "queued",
      operator: "阿豪",
      draft: {},
      reworkCount: 0,
      lastIssues: [],
      createdAt: now - 40 * min,
      events: [
        {
          at: now - 40 * min,
          type: "register_queue",
          by: "阿豪",
          note: "登记入队：残压 10bar，目标 200bar / O₂ 21% / He 35% / Trimix",
        },
      ],
    },
    "TANK-177": {
      id: "TANK-177",
      volume: "12L 钢瓶",
      inspectionExpiry: datePlus(-6),
      residualPressure: 0,
      targetPressure: 200,
      targetO2: 20.9,
      targetHe: 0,
      method: "空气",
      status: "inspection",
      operator: "阿豪",
      draft: {},
      reworkCount: 0,
      lastIssues: [],
      createdAt: now - 25 * min,
      events: [
        {
          at: now - 25 * min,
          type: "register_inspection",
          by: "阿豪",
          note: `检验有效期 ${datePlus(-6)} 已过期，分流至送检区，不占用充填位`,
        },
      ],
    },
    "TANK-188": {
      id: "TANK-188",
      volume: "10L 铝瓶",
      inspectionExpiry: datePlus(150),
      residualPressure: 20,
      targetPressure: 200,
      targetO2: 36,
      targetHe: 0,
      method: "高氧",
      status: "awaiting_review",
      operator: "阿豪",
      draft: {},
      final: { pressure: 198, o2: 35.8, he: 0, method: "高氧" },
      reworkCount: 1,
      lastIssues: [],
      createdAt: now - 300 * min,
      events: [
        {
          at: now - 300 * min,
          type: "register_queue",
          by: "阿豪",
          note: "登记入队：残压 20bar，目标 200bar / O₂ 36% / He 0% / 高氧",
        },
        { at: now - 280 * min, type: "assign", by: "阿豪", note: "接入充填位 #2" },
        {
          at: now - 200 * min,
          type: "finish_fail",
          by: "阿豪",
          note: "收尾超差 → 返工（实测 150bar / O₂ 36.2% / He 0% / 高氧）：实测压力 150bar 超出 200±10bar",
        },
        { at: now - 120 * min, type: "param", by: "阿豪", note: "录入参数：压力 190bar" },
        {
          at: now - 60 * min,
          type: "finish_ok",
          by: "阿豪",
          note: "收尾合格（实测 198bar / O₂ 35.8% / He 0% / 高氧），返工后合格，待复核签字",
        },
      ],
    },
  };

  return {
    dutyOperator: "阿豪",
    slots: ["TANK-219", null, null],
    jobs,
  };
}

// ---------- 本地持久化（刷新后保留） ----------

export function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (parsed && parsed.jobs && Array.isArray(parsed.slots)) {
        return parsed;
      }
    }
  } catch {
    // 解析失败则回退到演示数据
  }
  return seedState();
}

export function saveState(state: State): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默失败
  }
}
