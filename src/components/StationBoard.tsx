import { useState } from "react";
import {
  FILL_MODES,
  FILL_STATIONS,
  TOL,
  checkMeasure,
  fmtTime,
  inspectLabel,
  rangeText,
} from "../domain";
import type { FillMode, FillOrder } from "../types";
import type { StationApi } from "../state";
import { Field, Modal } from "./Modal";

function SlotCard({
  stationId,
  name,
  order,
  station,
  onDetail,
  onClose,
}: {
  stationId: string;
  name: string;
  order: FillOrder | undefined;
  station: StationApi;
  onDetail: (o: FillOrder) => void;
  onClose: (o: FillOrder) => void;
}) {
  const { state, logParam, unassignSlot } = station;
  const [p, setP] = useState(100);
  const [o2, setO2] = useState(21);
  const [he, setHe] = useState(0);
  const [note, setNote] = useState("");

  if (!order) {
    return (
      <article className="slot slot-empty">
        <header>
          <h3>{name}</h3>
          <span className="slot-state free">空闲</span>
        </header>
        <p className="muted">从右侧「待充填队列」安排气瓶上位置</p>
      </article>
    );
  }

  const insp = inspectLabel(order.inspectUntil);
  const last = order.params[order.params.length - 1];
  const handedOver = order.timeline.some(
    (e) => e.type === "handover" && order.params.length > 0
  );

  return (
    <article className="slot slot-busy">
      <header>
        <div>
          <h3>
            {name} <small>{stationId}</small>
          </h3>
          <span className="slot-state busy">作业中 · 仅此一项</span>
        </div>
        <button className="link-btn" onClick={() => onDetail(order)}>
          全程记录
        </button>
      </header>

      <div className="slot-tank">
        <div>
          <b>{order.tankNo}</b>
          <span>{order.volume}</span>
        </div>
        <div className="slot-target">
          目标 {order.targetPressure}bar · O₂ {order.targetO2}% · He {order.targetHe}% · {order.mode}
        </div>
        <div className="slot-meta">
          残压 {order.residualPressure}bar · 检验 {order.inspectUntil}（
          <em className={`insp-${insp.tone}`}>{insp.text}</em>）
        </div>
      </div>

      <div className="param-log">
        <p>已录参数（{order.params.length} 条，随班次移交，不可事后补记）</p>
        {order.params.length === 0 ? (
          <p className="muted small">暂无参数记录</p>
        ) : (
          <ul>
            {order.params.slice(-4).map((l) => (
              <li key={l.id}>
                <b>{fmtTime(l.at)}</b>
                <span>
                  {l.pressure}bar / O₂ {l.o2}% / He {l.he}%
                </span>
                <span className="muted small">
                  {l.operator}·第{l.shiftSeq}班
                  {l.note ? "·" + l.note : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="quick-param">
        <div className="qp-row">
          <label>
            压力
            <input type="number" value={p} onChange={(e) => setP(Number(e.target.value))} />
          </label>
          <label>
            O₂%
            <input type="number" step="0.1" value={o2} onChange={(e) => setO2(Number(e.target.value))} />
          </label>
          <label>
            He%
            <input type="number" step="0.1" value={he} onChange={(e) => setHe(Number(e.target.value))} />
          </label>
        </div>
        <input
          className="qp-note"
          placeholder="备注（可选），如：补压、稳压观察"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="qp-actions">
          <button
            disabled={!state.currentOperator}
            onClick={() => {
              logParam(order.id, { pressure: p, o2, he, note: note.trim() });
              setNote("");
            }}
          >
            记录当前参数
          </button>
          <button
            disabled={!state.currentOperator}
            onClick={() => {
              if (last) {
                setP(last.pressure);
                setO2(last.o2);
                setHe(last.he);
              }
              onClose(order);
            }}
          >
            收尾填写
          </button>
          <button
            className="link-btn"
            disabled={!state.currentOperator}
            onClick={() => unassignSlot(order.id)}
          >
            撤下（参数保留）
          </button>
        </div>
        {handedOver && (
          <p className="handover-mark">↪ 本作业经换班移交，由 {last?.operator ?? "上一班"} 已录参数继续完成</p>
        )}
      </div>
    </article>
  );
}

export function CloseDialog({
  order,
  station,
  onClose,
}: {
  order: FillOrder;
  station: StationApi;
  onClose: () => void;
}) {
  const { closeOrder } = station;
  const [pressure, setPressure] = useState(order.targetPressure);
  const [o2, setO2] = useState(order.targetO2);
  const [he, setHe] = useState(order.targetHe);
  const [mode, setMode] = useState<FillMode>(order.mode);
  const check = checkMeasure(order, { pressure, o2, he });

  return (
    <Modal title={`收尾填写 · ${order.tankNo}`} onClose={onClose} width={580}>
      <p className="modal-tip">
        收尾必须实测并填写压力、O₂、He 和充填方式；提交后记录锁定，不能关闭后再补记。
      </p>
      <div className="target-box">
        <span>压力合格区间 {rangeText(order.targetPressure, TOL.pressure, "bar")}</span>
        <span>O₂ 合格区间 {rangeText(order.targetO2, TOL.o2, "%")}</span>
        <span>He 合格区间 {rangeText(order.targetHe, TOL.he, "%")}</span>
      </div>
      <div className="field-grid">
        <Field label={`实测压力 (bar) ${check.pressureOk ? "✓ 在区间内" : "✗ 超差"}`}>
          <input
            type="number"
            value={pressure}
            className={check.pressureOk ? "" : "input-bad"}
            onChange={(e) => setPressure(Number(e.target.value))}
          />
        </Field>
        <Field label={`实测 O₂ (%) ${check.o2Ok ? "✓ 在区间内" : "✗ 超差"}`}>
          <input
            type="number"
            step="0.1"
            value={o2}
            className={check.o2Ok ? "" : "input-bad"}
            onChange={(e) => setO2(Number(e.target.value))}
          />
        </Field>
        <Field label={`实测 He (%) ${check.heOk ? "✓ 在区间内" : "✗ 超差"}`}>
          <input
            type="number"
            step="0.1"
            value={he}
            className={check.heOk ? "" : "input-bad"}
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
      <div className={`verdict ${check.passed ? "verdict-ok" : "verdict-bad"}`}>
        {check.passed
          ? "✓ 四项均符合目标：提交后即可交付，单据锁定。"
          : "✗ 存在超差项：" + check.deviations.join("；") + "。提交后整单进入返工，须复核签字才能交付。"}
      </div>
      <div className="modal-foot">
        <button onClick={onClose}>再测一次</button>
        <button
          className={check.passed ? "primary" : "danger"}
          onClick={() => {
            closeOrder(order.id, { pressure, o2, he, mode });
            onClose();
          }}
        >
          {check.passed ? "确认收尾并交付" : "确认收尾，转入返工"}
        </button>
      </div>
    </Modal>
  );
}

export function StationBoard({
  station,
  onDetail,
}: {
  station: StationApi;
  onDetail: (o: FillOrder) => void;
}) {
  const [closing, setClosing] = useState<FillOrder | null>(null);
  // 收尾弹窗里的订单以最新 state 为准，避免已提交后仍操作旧对象
  const liveClosing = closing ? station.state.orders.find((o) => o.id === closing.id) : null;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>充填位看板</p>
          <h2>当日充填位</h2>
        </div>
        <span className="muted small">一项未完工气瓶独占一个位置 · 换班不撤单</span>
      </div>
      <div className="slots">
        {FILL_STATIONS.map((s) => (
          <SlotCard
            key={s.id}
            stationId={s.id}
            name={s.name}
            order={station.slotMap[s.id]}
            station={station}
            onDetail={onDetail}
            onClose={(o) => setClosing(o)}
          />
        ))}
      </div>
      {liveClosing && liveClosing.status === "filling" && (
        <CloseDialog order={liveClosing} station={station} onClose={() => setClosing(null)} />
      )}
    </section>
  );
}
