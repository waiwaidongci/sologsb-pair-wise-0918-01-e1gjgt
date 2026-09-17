import { useMemo, useState } from "react";
import { fmtDateTime } from "../domain";
import type { FillOrder } from "../types";
import type { StationApi } from "../state";
import { Modal, STATUS_META } from "./Modal";

const TYPE_LABEL: Record<string, string> = {
  created: "登记",
  assigned: "上充填位",
  unassigned: "撤下",
  param: "过程参数",
  passed_close: "收尾合格",
  rework_close: "收尾超差",
  rework_deliver: "返工交付",
  deliver: "交付",
  handover: "换班移交",
  inspection_return: "复检回队",
};

export function OrderDetail({
  orderId,
  tankRecords,
  station,
  onClose,
}: {
  orderId: string;
  tankRecords: boolean;
  station: StationApi;
  onClose: () => void;
}) {
  const orders = station.state.orders;
  const order = orders.find((o) => o.id === orderId);
  if (!order) return null;

  if (tankRecords) {
    const sameTank = orders.filter((o) => o.tankNo === order.tankNo);
    return (
      <Modal title={`气瓶历史 · ${order.tankNo}（${sameTank.length} 单）`} onClose={onClose} width={640}>
        <div className="history-list">
          {sameTank.map((h) => {
            const meta = STATUS_META[h.status];
            return (
              <div key={h.id} className="history-row">
                <div>
                  <b>{h.id}</b>
                  <span className={`status-pill ${meta.cls}`}>{meta.label}</span>
                </div>
                <p>
                  {fmtDateTime(h.createdAt)} · {h.mode} · 目标 {h.targetPressure}bar / O₂{" "}
                  {h.targetO2}% / He {h.targetHe}%
                </p>
                {h.close && (
                  <p className="muted small">
                    收尾实测 {h.close.pressure}bar / O₂ {h.close.o2}% / He {h.close.he}%
                    {h.rework ? ` · 返工后复核签字：${h.rework.reviewerSign}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Modal>
    );
  }

  const locked = order.status === "delivered";
  return (
    <Modal title={`全程记录 · ${order.tankNo}`} onClose={onClose} width={720}>
      <div className="detail-head">
        <div>
          <span className={`status-pill ${STATUS_META[order.status].cls}`}>
            {STATUS_META[order.status].label}
          </span>
          <span className="oc-id">{order.id}</span>
        </div>
        {locked && <span className="lock-tag">🔒 已锁定，不可补记或修改</span>}
      </div>

      <dl className="detail-grid">
        <div><dt>瓶型容积</dt><dd>{order.volume}</dd></div>
        <div><dt>充填方式</dt><dd>{order.mode}</dd></div>
        <div><dt>残压</dt><dd>{order.residualPressure} bar</dd></div>
        <div><dt>目标压力</dt><dd>{order.targetPressure} bar</dd></div>
        <div><dt>目标 O₂</dt><dd>{order.targetO2} %</dd></div>
        <div><dt>目标 He</dt><dd>{order.targetHe} %</dd></div>
        <div><dt>检验有效期</dt><dd>{order.inspectUntil}</dd></div>
        <div><dt>登记操作员</dt><dd>{order.operator}</dd></div>
      </dl>

      <h5>过程参数（{order.params.length}）</h5>
      {order.params.length === 0 ? (
        <p className="muted">无</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>压力(bar)</th>
              <th>O₂(%)</th>
              <th>He(%)</th>
              <th>记录人 / 班次</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {order.params.map((l) => (
              <tr key={l.id}>
                <td>{fmtDateTime(l.at)}</td>
                <td>{l.pressure}</td>
                <td>{l.o2}</td>
                <td>{l.he}</td>
                <td>
                  {l.operator} · 第{l.shiftSeq}班
                </td>
                <td>{l.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {order.close && (
        <>
          <h5>收尾实测</h5>
          <table className="data-table">
            <tbody>
              <tr>
                <td>压力 / O₂ / He</td>
                <td>
                  {order.close.pressure}bar / {order.close.o2}% / {order.close.he}%
                </td>
              </tr>
              <tr>
                <td>充填方式</td>
                <td>{order.close.mode}</td>
              </tr>
              <tr>
                <td>结论</td>
                <td className={order.close.passed ? "ok-text" : "bad-text"}>
                  {order.close.passed ? "全部在目标区间，已交付" : order.close.deviation.join("；")}
                </td>
              </tr>
              <tr>
                <td>收尾人 / 时间</td>
                <td>
                  {order.close.operator} · {fmtDateTime(order.close.at)}
                </td>
              </tr>
              {order.rework && (
                <tr>
                  <td>返工复核</td>
                  <td>
                    复测 {order.rework.pressure}bar / {order.rework.o2}% / {order.rework.he}%，
                    复核人签字 <b>{order.rework.reviewerSign}</b> · {fmtDateTime(order.rework.at)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <h5>流转时间线</h5>
      <ol className="timeline">
        {order.timeline.map((e) => (
          <li key={e.id}>
            <div className="tl-top">
              <span className={`tl-type tl-${e.type}`}>{TYPE_LABEL[e.type] ?? e.type}</span>
              <time>
                {fmtDateTime(e.at)} · {e.operator} · 第{e.shiftSeq}班
              </time>
            </div>
            <p>{e.text}</p>
          </li>
        ))}
      </ol>
    </Modal>
  );
}

export function RecordsPanel({ station }: { station: StationApi }) {
  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tankMode, setTankMode] = useState(false);
  const orders = station.state.orders;
  const filtered = useMemo(() => {
    const kw = q.trim().toUpperCase();
    if (!kw) return orders;
    return orders.filter(
      (o) => o.tankNo.toUpperCase().includes(kw) || o.id.toUpperCase().includes(kw)
    );
  }, [orders, q]);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>刷新后仍保留 · 本地留痕</p>
          <h2>全部充填记录</h2>
        </div>
        <input
          className="search"
          placeholder="搜气瓶编号 / 单号，如 TANK-219"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <table className="data-table records-table">
        <thead>
          <tr>
            <th>单号</th>
            <th>气瓶</th>
            <th>方式</th>
            <th>目标</th>
            <th>收尾实测</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((o) => {
            const meta = STATUS_META[o.status];
            return (
              <tr key={o.id} className={o.status === "delivered" ? "row-locked" : ""}>
                <td className="oc-id">{o.id}</td>
                <td>{o.tankNo}</td>
                <td>{o.mode}</td>
                <td>
                  {o.targetPressure}bar
                  <br />
                  <span className="muted small">
                    O₂ {o.targetO2}% / He {o.targetHe}%
                  </span>
                </td>
                <td>
                  {o.close
                    ? `${o.close.pressure}bar / ${o.close.o2}% / ${o.close.he}%`
                    : "—"}
                  {o.rework && <span className="signed"> ✓{o.rework.reviewerSign}</span>}
                </td>
                <td>
                  <span className={`status-pill ${meta.cls}`}>{meta.label}</span>
                </td>
                <td>
                  <button className="link-btn" onClick={() => { setTankMode(false); setDetailId(o.id); }}>
                    全程
                  </button>
                  <button className="link-btn" onClick={() => { setTankMode(true); setDetailId(o.id); }}>
                    该瓶历史
                  </button>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="empty">没有匹配的记录</td>
            </tr>
          )}
        </tbody>
      </table>
      {detailId && (
        <OrderDetail
          orderId={detailId}
          tankRecords={tankMode}
          station={station}
          onClose={() => setDetailId(null)}
        />
      )}
    </section>
  );
}

export function HandoverLog({ station }: { station: StationApi }) {
  const logs = station.state.handovers;
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>作业连同参数移交，不关闭、不补记</p>
          <h2>换班交接记录</h2>
        </div>
      </div>
      {logs.length === 0 && <p className="empty">尚无交接记录</p>}
      <ol className="handover-log">
        {logs.map((h) => (
          <li key={h.id}>
            <div className="hl-top">
              <b>
                {h.fromOperator} <span className="arrow">→</span> {h.toOperator}
              </b>
              <time>
                {fmtDateTime(h.at)} · 第{h.shiftSeq}班交班
              </time>
            </div>
            <p>{h.summary}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
