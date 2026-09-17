import type { ReactNode } from "react";
import { fmtDateTime, inspectLabel } from "../domain";
import type { FillOrder } from "../types";
import { STATUS_META } from "./Modal";

export function OrderCard({
  order,
  children,
  onDetail,
}: {
  order: FillOrder;
  children?: ReactNode;
  onDetail: () => void;
}) {
  const insp = inspectLabel(order.inspectUntil);
  const meta = STATUS_META[order.status];
  return (
    <article className="order-card">
      <header className="oc-head">
        <div>
          <h4>{order.tankNo}</h4>
          <span className="oc-id">{order.id}</span>
        </div>
        <span className={`status-pill ${meta.cls}`}>{meta.label}</span>
      </header>

      <dl className="oc-grid">
        <div>
          <dt>瓶型</dt>
          <dd>{order.volume}</dd>
        </div>
        <div>
          <dt>充填方式</dt>
          <dd>{order.mode}</dd>
        </div>
        <div>
          <dt>残压→目标</dt>
          <dd>
            {order.residualPressure} → {order.targetPressure} bar
          </dd>
        </div>
        <div>
          <dt>目标 O₂/He</dt>
          <dd>
            {order.targetO2}% / {order.targetHe}%
          </dd>
        </div>
        <div>
          <dt>检验有效期</dt>
          <dd>
            {order.inspectUntil}{" "}
            <em className={`insp-${insp.tone}`}>{insp.text}</em>
          </dd>
        </div>
        <div>
          <dt>登记 / 班次</dt>
          <dd>
            {order.operator} · {fmtDateTime(order.createdAt)}
          </dd>
        </div>
      </dl>

      {order.status === "rework" && order.close && (
        <div className="oc-deviation">
          <b>收尾超差，待返工：</b>
          {order.close.deviation.join("；")}
        </div>
      )}
      {order.status === "delivered" && order.close && (
        <div className="oc-closed">
          实测 {order.close.pressure}bar / O₂ {order.close.o2}% / He {order.close.he}%（
          {order.close.mode}）· 已于 {fmtDateTime(order.deliveredAt!)} 交付，记录已锁定
          {order.rework && <> · 复核签字：{order.rework.reviewerSign}</>}
        </div>
      )}

      {children && <div className="oc-actions">{children}</div>}
      <button className="link-btn" onClick={onDetail}>
        查看全程记录与参数 →
      </button>
    </article>
  );
}
