import { useState } from "react";
import {
  FILL_STATIONS,
  FILL_MODES,
  TOL,
  checkMeasure,
  isInspectionExpired,
  rangeText,
} from "../domain";
import type { FillMode, FillOrder } from "../types";
import type { StationApi } from "../state";
import { Field, Modal } from "./Modal";
import { OrderCard } from "./OrderCard";

export function QueuePanel({
  station,
  onDetail,
}: {
  station: StationApi;
  onDetail: (o: FillOrder) => void;
}) {
  const { state, slotMap, assignSlot } = station;
  const queued = state.orders.filter((o) => o.status === "queued");
  const freeStations = FILL_STATIONS;
  return (
    <section className="panel zone">
      <div className="heading">
        <div>
          <p>当日待充填队列</p>
          <h2>
            待充填 <span className="count">{queued.length}</span>
          </h2>
        </div>
      </div>
      <p className="zone-note">仅检验在有效期的气瓶可排队；安排上空闲充填位即开始作业，每个位置同时只承接一项。</p>
      {queued.length === 0 && <p className="empty">暂无待充填气瓶</p>}
      <div className="card-list">
        {queued.map((o) => (
          <OrderCard key={o.id} order={o} onDetail={() => onDetail(o)}>
            <select
              defaultValue=""
              disabled={!state.currentOperator}
              onChange={(e) => {
                if (e.target.value) assignSlot(o.id, e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">安排到充填位…</option>
              {freeStations.map((s) => (
                <option key={s.id} value={s.id} disabled={Boolean(slotMap[s.id])}>
                  {s.name}
                  {slotMap[s.id] ? `（占用中：${slotMap[s.id]!.tankNo}）` : "（空闲）"}
                </option>
              ))}
            </select>
          </OrderCard>
        ))}
      </div>
    </section>
  );
}

export function InspectionPanel({
  station,
  onDetail,
}: {
  station: StationApi;
  onDetail: (o: FillOrder) => void;
}) {
  const { state, returnFromInspection } = station;
  const [dates, setDates] = useState<Record<string, string>>({});
  const list = state.orders.filter((o) => o.status === "inspection");
  return (
    <section className="panel zone zone-inspection">
      <div className="heading">
        <div>
          <p>检验过期分流</p>
          <h2>
            送检区 <span className="count count-warn">{list.length}</span>
          </h2>
        </div>
      </div>
      <p className="zone-note warn">
        ⛔ 检验已过期气瓶只能在此等待送检，不能安排上任何充填位；复检合格、更新检验有效期后回到队列。
      </p>
      {list.length === 0 && <p className="empty">送检区暂无气瓶</p>}
      <div className="card-list">
        {list.map((o) => {
          const newDate = dates[o.id] ?? "";
          const valid = newDate && !isInspectionExpired(newDate);
          return (
            <OrderCard key={o.id} order={o} onDetail={() => onDetail(o)}>
              <div className="inline-form">
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setDates((d) => ({ ...d, [o.id]: e.target.value }))}
                />
                <button
                  disabled={!state.currentOperator || !valid}
                  onClick={() => returnFromInspection(o.id, newDate)}
                >
                  复检通过，回队列
                </button>
              </div>
            </OrderCard>
          );
        })}
      </div>
    </section>
  );
}

export function ReworkPanel({
  station,
  onDetail,
}: {
  station: StationApi;
  onDetail: (o: FillOrder) => void;
}) {
  const { state, deliverRework } = station;
  const [active, setActive] = useState<FillOrder | null>(null);
  const [pressure, setPressure] = useState(0);
  const [o2, setO2] = useState(0);
  const [he, setHe] = useState(0);
  const [mode, setMode] = useState<FillMode>("空气");
  const [sign, setSign] = useState("");
  const [tried, setTried] = useState(false);
  const list = state.orders.filter((o) => o.status === "rework");

  const open = (o: FillOrder) => {
    setActive(o);
    setPressure(o.targetPressure);
    setO2(o.targetO2);
    setHe(o.targetHe);
    setMode(o.mode);
    setSign("");
    setTried(false);
  };

  const live = active
    ? checkMeasure(active, { pressure, o2, he })
    : { passed: false, pressureOk: false, o2Ok: false, heOk: false, deviations: [] };

  return (
    <section className="panel zone zone-rework">
      <div className="heading">
        <div>
          <p>收尾超差</p>
          <h2>
            返工区 <span className="count count-danger">{list.length}</span>
          </h2>
        </div>
      </div>
      <p className="zone-note warn">
        返工后须重新实测压力 / O₂ / He，全部回到目标区间，且有复核人签字，才允许交付。
      </p>
      {list.length === 0 && <p className="empty">当前没有返工气瓶</p>}
      <div className="card-list">
        {list.map((o) => (
          <OrderCard key={o.id} order={o} onDetail={() => onDetail(o)}>
            <button className="danger" disabled={!state.currentOperator} onClick={() => open(o)}>
              返工复核 / 交付
            </button>
          </OrderCard>
        ))}
      </div>

      {active && (
        <Modal title={`返工复核 · ${active.tankNo}`} onClose={() => setActive(null)} width={560}>
          <div className="target-box">
            <span>目标压力 {rangeText(active.targetPressure, TOL.pressure, "bar")}</span>
            <span>O₂ {rangeText(active.targetO2, TOL.o2, "%")}</span>
            <span>He {rangeText(active.targetHe, TOL.he, "%")}</span>
          </div>
          <div className="field-grid">
            <Field label={`实测压力 (bar) ${live.pressureOk ? "✓" : "✗"}`}>
              <input
                type="number"
                value={pressure}
                className={live.pressureOk ? "" : "input-bad"}
                onChange={(e) => setPressure(Number(e.target.value))}
              />
            </Field>
            <Field label={`实测 O₂ (%) ${live.o2Ok ? "✓" : "✗"}`}>
              <input
                type="number"
                step="0.1"
                value={o2}
                className={live.o2Ok ? "" : "input-bad"}
                onChange={(e) => setO2(Number(e.target.value))}
              />
            </Field>
            <Field label={`实测 He (%) ${live.heOk ? "✓" : "✗"}`}>
              <input
                type="number"
                step="0.1"
                value={he}
                className={live.heOk ? "" : "input-bad"}
                onChange={(e) => setHe(Number(e.target.value))}
              />
            </Field>
            <Field label="充填方式">
              <select value={mode} onChange={(e) => setMode(e.target.value as FillMode)}>
                {FILL_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="复核人签字 *" hint="手写姓名即视为签字确认">
            <input value={sign} onChange={(e) => setSign(e.target.value)} placeholder="复核人姓名" />
          </Field>
          {!live.passed && (
            <p className="modal-tip warn">
              仍有项目超出目标区间{live.deviations.length ? "：" + live.deviations.join("；") : ""}
              ，暂不能交付。
            </p>
          )}
          {tried && !sign.trim() && <p className="modal-tip warn">返工交付必须有复核人签字。</p>}
          <div className="modal-foot">
            <button onClick={() => setActive(null)}>取消</button>
            <button
              className="primary"
              disabled={!live.passed || !sign.trim()}
              onClick={() => {
                setTried(true);
                if (!live.passed || !sign.trim()) return;
                deliverRework(active.id, { pressure, o2, he, mode }, sign);
                setActive(null);
              }}
            >
              复核合格，签字交付
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
