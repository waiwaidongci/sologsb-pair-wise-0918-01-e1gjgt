import { useCallback, useEffect, useMemo, useState } from "react";
import {
  checkMeasure,
  isInspectionExpired,
  modeDefaults,
  todayStr,
  uid,
} from "./domain";
import type {
  FillMode,
  FillOrder,
  HandoverEvent,
  OrderStatus,
  ParamLog,
  StationState,
} from "./types";

export interface IntakeInput {
  tankNo: string;
  volume: string;
  inspectUntil: string;
  residualPressure: number;
  targetPressure: number;
  targetO2: number;
  targetHe: number;
  mode: FillMode;
}

export interface CloseInput {
  pressure: number;
  o2: number;
  he: number;
  mode: FillMode;
}

const STORAGE_KEY = "dive-fill-station-v1";

/** 生成初始演示数据：日期相对今天，保证分流、返工、已锁定状态都能看到 */
function seed(): StationState {
  const now = new Date();
  const iso = (day: number) => new Date(now.getTime() + day * 86400000).toISOString();
  const day = (offset: number) => iso(offset).slice(0, 10);
  const operator = "王杰";
  const mk = (partial: Partial<FillOrder> & Pick<FillOrder, "id" | "tankNo" | "inspectUntil" | "status">): FillOrder => ({
    volume: "12L 铝瓶",
    residualPressure: 50,
    targetPressure: 200,
    targetO2: 21,
    targetHe: 0,
    mode: "空气",
    operator,
    createdAt: iso(-2),
    slotId: null,
    params: [],
    close: null,
    rework: null,
    deliveredAt: null,
    timeline: [
      {
        id: uid("ev"),
        at: iso(-2),
        type: "created",
        text: `气瓶 ${partial.tankNo} 登记入店`,
        operator,
        shiftSeq: 1,
      },
    ],
    ...partial,
  });

  return {
    shiftSeq: 1,
    currentOperator: null, // 打开页面先签到当班
    shiftStartedAt: null,
    seq: 6,
    handovers: [
      {
        id: uid("hv"),
        at: iso(-1),
        fromOperator: "陈海",
        toOperator: "王杰",
        shiftSeq: 1,
        summary: "TANK-219（EAN32）充填中，压力已录至 160bar，交班继续",
      },
    ],
    orders: [
      mk({
        id: `TC-${todayStr().replace(/-/g, "")}-001`,
        tankNo: "TANK-204",
        inspectUntil: day(120),
        status: "queued",
        volume: "12L 铝瓶",
        residualPressure: 55,
        createdAt: iso(-1),
        timeline: [
          {
            id: uid("ev"),
            at: iso(-1),
            type: "created",
            text: "气瓶 TANK-204 登记入店，检验有效，进入当日待充填队列",
            operator,
            shiftSeq: 1,
          },
        ],
      }),
      mk({
        id: `TC-${todayStr().replace(/-/g, "")}-002`,
        tankNo: "TANK-231",
        inspectUntil: day(12),
        status: "queued",
        volume: "11L 钢瓶",
        targetO2: 32,
        mode: "高氧 EAN",
        createdAt: iso(-1),
        timeline: [
          {
            id: uid("ev"),
            at: iso(-1),
            type: "created",
            text: "气瓶 TANK-231 登记入店，检验剩余 12 天，已提醒",
            operator,
            shiftSeq: 1,
          },
        ],
      }),
      mk({
        id: `TC-${todayStr().replace(/-/g, "")}-003`,
        tankNo: "TANK-188",
        inspectUntil: day(-20),
        status: "inspection",
        volume: "双瓶组",
        createdAt: iso(-1),
        timeline: [
          {
            id: uid("ev"),
            at: iso(-1),
            type: "created",
            text: "气瓶 TANK-188 检验已过期 20 天，直接分流至送检区，不得占用充填位",
            operator,
            shiftSeq: 1,
          },
        ],
      }),
      mk({
        id: `TC-${todayStr().replace(/-/g, "")}-004`,
        tankNo: "TANK-219",
        inspectUntil: day(200),
        status: "filling",
        volume: "11L 钢瓶",
        targetO2: 32,
        mode: "高氧 EAN",
        slotId: "S1",
        residualPressure: 40,
        params: [
          { id: uid("p"), at: iso(-0.3), operator: "陈海", shiftSeq: 1, pressure: 110, o2: 31.6, he: 0, note: "开始充填 EAN32" },
          { id: uid("p"), at: iso(-0.1), operator: "陈海", shiftSeq: 1, pressure: 160, o2: 31.8, he: 0, note: "交班参数" },
        ],
        timeline: [
          { id: uid("ev"), at: iso(-1), type: "created", text: "气瓶 TANK-219 登记入店", operator: "陈海", shiftSeq: 1 },
          { id: uid("ev"), at: iso(-0.3), type: "assigned", text: "安排至 充填位 1 号", operator: "陈海", shiftSeq: 1 },
          { id: uid("ev"), at: iso(-0.1), type: "handover", text: "换班交接：作业与已录参数移交王杰，未关闭、不补记", operator: "陈海", shiftSeq: 1 },
        ],
      }),
      mk({
        id: `TC-${todayStr().replace(/-/g, "")}-005`,
        tankNo: "TANK-156",
        inspectUntil: day(90),
        status: "rework",
        volume: "12L 钢瓶",
        targetO2: 18,
        targetHe: 35,
        mode: "Trimix",
        residualPressure: 30,
        slotId: null,
        timeline: [
          { id: uid("ev"), at: iso(-2), type: "created", text: "气瓶 TANK-156 登记入店", operator, shiftSeq: 1 },
          { id: uid("ev"), at: iso(-1), type: "assigned", text: "安排至 充填位 2 号", operator, shiftSeq: 1 },
          { id: uid("ev"), at: iso(-0.5), type: "rework_close", text: "收尾 He 31.2% 低于目标区间，整单进入返工", operator, shiftSeq: 1 },
        ],
        close: {
          at: iso(-0.5),
          operator,
          shiftSeq: 1,
          pressure: 198,
          o2: 18.4,
          he: 31.2,
          mode: "Trimix",
          passed: false,
          deviation: ["实测 He 31.2% 超出目标 35±1%"],
        },
      }),
    ],
  };
}

function load(): StationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StationState;
      if (parsed && Array.isArray(parsed.orders)) return parsed;
    }
  } catch {
    /* 数据损坏时回落到演示数据 */
  }
  return seed();
}

function pushEvent(
  order: FillOrder,
  ev: Omit<import("./types").TimelineEvent, "id" | "at">,
  at = new Date().toISOString()
): FillOrder {
  return {
    ...order,
    timeline: [...order.timeline, { ...ev, id: uid("ev"), at }],
  };
}

export function useStation() {
  const [state, setState] = useState<StationState>(load);

  // 所有记录写入 localStorage，刷新 / 关闭重开后保留
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const updateOrder = useCallback((id: string, fn: (o: FillOrder) => FillOrder) => {
    setState((s) => ({ ...s, orders: s.orders.map((o) => (o.id === id ? fn(o) : o)) }));
  }, []);

  /** 当班签到 */
  const signIn = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((s) =>
      s.currentOperator
        ? s
        : { ...s, currentOperator: trimmed, shiftStartedAt: new Date().toISOString() }
    );
  }, []);

  /** 登记入店：先按检验有效期分流，过期只能进送检区 */
  const intake = useCallback((input: IntakeInput) => {
    setState((s) => {
      if (!s.currentOperator) return s;
      const seq = s.seq + 1;
      const id = `TC-${todayStr().replace(/-/g, "")}-${String(seq).padStart(3, "0")}`;
      const expired = isInspectionExpired(input.inspectUntil);
      const status: OrderStatus = expired ? "inspection" : "queued";
      const nowIso = new Date().toISOString();
      const order: FillOrder = {
        ...input,
        id,
        operator: s.currentOperator,
        createdAt: nowIso,
        status,
        slotId: null,
        params: [],
        close: null,
        rework: null,
        deliveredAt: null,
        timeline: [
          {
            id: uid("ev"),
            at: nowIso,
            type: "created",
            text: expired
              ? `气瓶 ${input.tankNo} 检验已过期，直接分流至送检区，禁止占用当日充填位`
              : `气瓶 ${input.tankNo} 登记入店，检验有效，进入当日待充填队列`,
            operator: s.currentOperator,
            shiftSeq: s.shiftSeq,
          },
        ],
      };
      return { ...s, seq, orders: [order, ...s.orders] };
    });
  }, []);

  /** 送检气瓶复检通过、检验有效期更新后回到队列 */
  const returnFromInspection = useCallback((id: string, newDate: string) => {
    setState((s) => {
      if (!s.currentOperator) return s;
      return {
        ...s,
        orders: s.orders.map((o) => {
          if (o.id !== id || o.status !== "inspection") return o;
          if (isInspectionExpired(newDate)) return o;
          return pushEvent(
            { ...o, inspectUntil: newDate, status: "queued" as OrderStatus },
            {
              type: "inspection_return",
              text: `复检通过，检验有效期更新至 ${newDate}，回到当日待充填队列`,
              operator: s.currentOperator!,
              shiftSeq: s.shiftSeq,
            }
          );
        }),
      };
    });
  }, []);

  /** 安排上充填位：每个充填位同时只承接一项未完工气瓶；送检区气瓶禁止上位置 */
  const assignSlot = useCallback((orderId: string, slotId: string) => {
    setState((s) => {
      if (!s.currentOperator) return s;
      const slotBusy = s.orders.some((o) => o.slotId === slotId && o.status === "filling");
      if (slotBusy) return s;
      return {
        ...s,
        orders: s.orders.map((o) => {
          if (o.id !== orderId) return o;
          if (o.status !== "queued" || isInspectionExpired(o.inspectUntil)) return o;
          const stationName = { S1: "充填位 1 号", S2: "充填位 2 号", S3: "充填位 3 号" }[slotId];
          return pushEvent(
            { ...o, status: "filling" as OrderStatus, slotId },
            {
              type: "assigned",
              text: `安排至 ${stationName}，该位置仅承接本气瓶至完工`,
              operator: s.currentOperator!,
              shiftSeq: s.shiftSeq,
            }
          );
        }),
      };
    });
  }, []);

  /** 撤下空位（未完工可先撤下，参数保留） */
  const unassignSlot = useCallback((orderId: string) => {
    setState((s) => {
      if (!s.currentOperator) return s;
      return {
        ...s,
        orders: s.orders.map((o) => {
          if (o.id !== orderId || o.status !== "filling") return o;
          return pushEvent(
            { ...o, status: "queued" as OrderStatus, slotId: null },
            {
              type: "unassigned",
              text: `撤下 ${o.slotId ? o.slotId.replace("S", "充填位 ") + " 号" : ""}，已录参数保留`,
              operator: s.currentOperator!,
              shiftSeq: s.shiftSeq,
            }
          );
        }),
      };
    });
  }, []);

  /** 作业过程中实时记录参数（随班次移交，不能事后补记到已关闭单据） */
  const logParam = useCallback((orderId: string, p: Omit<ParamLog, "id" | "at" | "operator" | "shiftSeq">) => {
    setState((s) => {
      if (!s.currentOperator) return s;
      return {
        ...s,
        orders: s.orders.map((o) => {
          if (o.id !== orderId || o.status !== "filling") return o;
          const log: ParamLog = {
            ...p,
            id: uid("p"),
            at: new Date().toISOString(),
            operator: s.currentOperator!,
            shiftSeq: s.shiftSeq,
          };
          return pushEvent(
            { ...o, params: [...o.params, log] },
            {
              type: "param",
              text: `过程参数：${p.pressure}bar / O₂ ${p.o2}% / He ${p.he}%${p.note ? "（" + p.note + "）" : ""}`,
              operator: s.currentOperator!,
              shiftSeq: s.shiftSeq,
            }
          );
        }),
      };
    });
  }, []);

  /**
   * 收尾：必须填写实测压力、O₂、He 和充填方式。
   * 全部在目标区间 → 可交付；任一项超差 → 整单进入返工。
   * 一旦收尾即锁定，不能关闭后再补记。
   */
  const closeOrder = useCallback((orderId: string, input: CloseInput) => {
    setState((s) => {
      if (!s.currentOperator) return s;
      return {
        ...s,
        orders: s.orders.map((o) => {
          if (o.id !== orderId || o.status !== "filling" || o.close) return o;
          const check = checkMeasure(o, input);
          const nowIso = new Date().toISOString();
          const closed: FillOrder = {
            ...o,
            close: {
              at: nowIso,
              operator: s.currentOperator!,
              shiftSeq: s.shiftSeq,
              ...input,
              passed: check.passed,
              deviation: check.deviations,
            },
            status: check.passed ? ("delivered" as OrderStatus) : ("rework" as OrderStatus),
            slotId: null,
            deliveredAt: check.passed ? nowIso : null,
          };
          return pushEvent(
            closed,
            check.passed
              ? {
                  type: "passed_close",
                  text: `收尾合格：${input.pressure}bar / O₂ ${input.o2}% / He ${input.he}%（${input.mode}），交付并锁定记录`,
                  operator: s.currentOperator!,
                  shiftSeq: s.shiftSeq,
                }
              : {
                  type: "rework_close",
                  text: `收尾超差（${check.deviations.join("；")}），整单进入返工，充填位释放`,
                  operator: s.currentOperator!,
                  shiftSeq: s.shiftSeq,
                },
            nowIso
          );
        }),
      };
    });
  }, []);

  /**
   * 返工复核：重新测压力 / O₂ / He，须有人签字，且全部回到目标区间，才能交付。
   */
  const deliverRework = useCallback(
    (orderId: string, input: CloseInput, reviewerSign: string) => {
      setState((s) => {
        if (!s.currentOperator) return s;
        const sign = reviewerSign.trim();
        if (!sign) return s;
        return {
          ...s,
          orders: s.orders.map((o) => {
            if (o.id !== orderId || o.status !== "rework") return o;
            const check = checkMeasure(o, input);
            if (!check.passed) return o;
            const nowIso = new Date().toISOString();
            const delivered: FillOrder = {
              ...o,
              rework: {
                at: nowIso,
                reworker: s.currentOperator!,
                reviewerSign: sign,
                ...input,
                passed: true,
                deviation: [],
              },
              status: "delivered" as OrderStatus,
              deliveredAt: nowIso,
            };
            return pushEvent(
              delivered,
              {
                type: "rework_deliver",
                text: `返工复核合格：${input.pressure}bar / O₂ ${input.o2}% / He ${input.he}%（${input.mode}）；复核人签字「${sign}」，交付并锁定`,
                operator: s.currentOperator!,
                shiftSeq: s.shiftSeq,
              },
              nowIso
            );
          }),
        };
      });
    },
    []
  );

  /**
   * 换班交接：在充填位上的作业连同已录参数交给下一位，单据保持 filling 不关闭；
   * 系统记录交接日志，已关闭 / 已交付记录不允许补记。
   */
  const handover = useCallback((toOperator: string) => {
    setState((s) => {
      if (!s.currentOperator) return s;
      const to = toOperator.trim();
      if (!to || to === s.currentOperator) return s;
      const nowIso = new Date().toISOString();
      const ongoing = s.orders.filter((o) => o.status === "filling");
      const names = ongoing
        .map((o) => {
          const last = o.params[o.params.length - 1];
          return `${o.tankNo}（${o.slotId ? o.slotId.replace("S", "充填位 ") + " 号" : "-"}${
            last ? `，最新 ${last.pressure}bar/O₂ ${last.o2}%/He ${last.he}%` : "，暂无过程参数"
          }）`;
        })
        .join("、");
      const summary = ongoing.length
        ? `在制作业 ${ongoing.length} 项：${names}；作业与已录参数移交 ${to}，单据不关闭、不补记`
        : `无在制作业，岗位移交 ${to}`;
      const event: HandoverEvent = {
        id: uid("hv"),
        at: nowIso,
        fromOperator: s.currentOperator,
        toOperator: to,
        shiftSeq: s.shiftSeq,
        summary,
      };
      const orders = s.orders.map((o) =>
        o.status === "filling"
          ? pushEvent(o, {
              type: "handover",
              text: `换班：${s.currentOperator} → ${to}，在制作业与全部已录参数移交，继续充填`,
              operator: s.currentOperator!,
              shiftSeq: s.shiftSeq,
            })
          : o
      );
      return {
        ...s,
        orders,
        handovers: [event, ...s.handovers],
        shiftSeq: s.shiftSeq + 1,
        currentOperator: to,
        shiftStartedAt: nowIso,
      };
    });
  }, []);

  const resetDemo = useCallback(() => setState(seed()), []);

  const slotMap = useMemo(() => {
    const m: Record<string, FillOrder | undefined> = {};
    for (const o of state.orders) if (o.status === "filling" && o.slotId) m[o.slotId] = o;
    return m;
  }, [state.orders]);

  return {
    state,
    slotMap,
    signIn,
    intake,
    returnFromInspection,
    assignSlot,
    unassignSlot,
    logParam,
    closeOrder,
    deliverRework,
    handover,
    resetDemo,
    modeHint: (m: FillMode) => modeDefaults(m).hint,
  };
}

export type StationApi = ReturnType<typeof useStation>;
