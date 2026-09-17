import { useEffect, useMemo, useReducer, useState } from "react";
import "./styles.css";
import {
  EVENT_LABEL,
  FILL_METHODS,
  SLOT_COUNT,
  STATUS_LABEL,
  TOLERANCE,
  daysUntil,
  fmtTime,
  isExpired,
  loadState,
  localDateStr,
  mixLabel,
  modHint,
  outOfRange,
  readingText,
  reducer,
  saveState,
  summarizeDraft,
  type FillMethod,
  type FinalReading,
  type Job,
  type State,
} from "./store";

type Modal =
  | { kind: "params"; id: string }
  | { kind: "finish"; id: string }
  | { kind: "history"; id: string }
  | { kind: "signoff"; id: string }
  | { kind: "review"; id: string }
  | { kind: "handover" }
  | null;

const VOLUMES = ["12L 铝瓶", "11L 钢瓶", "12L 钢瓶", "15L 钢瓶", "10L 铝瓶", "双瓶组", "3L 便携瓶"];

export default function App() {
  const [state, dispatch] = useReducer(reducer, null as unknown as State, loadState);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");

  // 所有记录写入本地存储，刷新后保留
  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  const jobs = useMemo(() => Object.values(state.jobs), [state.jobs]);
  const queued = jobs
    .filter((j) => j.status === "queued")
    .sort((a, b) => a.createdAt - b.createdAt);
  const inspection = jobs
    .filter((j) => j.status === "inspection")
    .sort((a, b) => b.createdAt - a.createdAt);
  const awaitingReview = jobs.filter((j) => j.status === "awaiting_review");
  const awaitingSignoff = jobs.filter((j) => j.status === "awaiting_signoff");
  const delivered = jobs
    .filter((j) => j.status === "delivered")
    .sort((a, b) => lastEvent(b).at - lastEvent(a).at);

  const freeSlots = state.slots.filter((s) => s === null).length;
  const today = localDateStr();
  const deliveredToday = delivered.filter((j) => localDateStr(new Date(lastEvent(j).at)) === today).length;
  const expiryAlerts = jobs.filter(
    (j) =>
      j.status === "inspection" ||
      (j.status !== "delivered" && daysUntil(j.inspectionExpiry) <= 30)
  ).length;

  const modalJob = modal && "id" in modal ? state.jobs[modal.id] : null;

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>🤿 潜水店值班充填台</h1>
          <p>检验分流 · 充填位作业 · 换班交接 · 收尾复核</p>
        </div>
        <div className="top-actions">
          <span className="duty">
            {today} · 值班 <b>{state.dutyOperator}</b>
          </span>
          <button onClick={() => setModal({ kind: "handover" })}>换班交接</button>
          <button
            className="ghost"
            onClick={() => {
              if (window.confirm("清空全部记录并恢复演示数据？")) {
                dispatch({ type: "reset" });
                setToast("已重置为演示数据");
              }
            }}
          >
            重置数据
          </button>
        </div>
      </header>

      <section className="metrics">
        <article>
          <small>待充填</small>
          <strong>{queued.length}</strong>
        </article>
        <article>
          <small>充填位占用</small>
          <strong>
            {SLOT_COUNT - freeSlots}/{SLOT_COUNT}
          </strong>
        </article>
        <article>
          <small>检验临期 / 过期</small>
          <strong className={expiryAlerts > 0 ? "warn-text" : ""}>{expiryAlerts}</strong>
        </article>
        <article>
          <small>今日交付</small>
          <strong>{deliveredToday}</strong>
        </article>
      </section>

      <div className="layout">
        <aside className="side-col">
          <RegisterForm
            existingIds={new Set(jobs.map((j) => j.id))}
            onSubmit={(input, expired) => {
              dispatch({ type: "register", input, by: state.dutyOperator });
              setToast(
                expired
                  ? `${input.id} 检验已过期，已分流至送检区（不占用充填位）`
                  : `${input.id} 已加入待充填队列`
              );
            }}
          />

          <section className="panel">
            <div className="heading">
              <h2>送检区</h2>
              <span className="badge badge-gray">{inspection.length}</span>
            </div>
            <p className="muted small">检验已过期气瓶仅可送检，不能占用当日充填位。</p>
            {inspection.length === 0 && <p className="muted">暂无待送检气瓶</p>}
            <div className="stack">
              {inspection.map((job) => (
                <article className="row-card" key={job.id}>
                  <div className="row-main">
                    <div className="row-title">
                      <strong>{job.id}</strong>
                      <ExpiryTag expiry={job.inspectionExpiry} />
                    </div>
                    <p className="muted">
                      {job.volume} · 检验有效期 {job.inspectionExpiry} · 登记人 {job.operator}
                    </p>
                  </div>
                  <div className="row-actions">
                    <button className="ghost" onClick={() => setModal({ kind: "history", id: job.id })}>
                      历史
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>

        <div className="main-col">
          <section className="panel">
            <div className="heading">
              <h2>充填位</h2>
              <span className="muted small">每个充填位同时只承接 1 项未完工气瓶</span>
            </div>
            <div className="slots">
              {state.slots.map((id, i) => (
                <SlotCard key={i} index={i} job={id ? state.jobs[id] : null} onOpen={setModal} />
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="heading">
              <h2>待充填队列</h2>
              <span className="muted small">
                {freeSlots > 0 ? `空闲充填位 ${freeSlots} 个` : "充填位已满"}
              </span>
            </div>
            {queued.length === 0 && <p className="muted">队列为空</p>}
            <div className="stack">
              {queued.map((job) => {
                const expired = isExpired(job.inspectionExpiry);
                return (
                  <article className="row-card" key={job.id}>
                    <div className="row-main">
                      <div className="row-title">
                        <strong>{job.id}</strong>
                        <span className="badge badge-blue">待充填</span>
                        <ExpiryTag expiry={job.inspectionExpiry} />
                      </div>
                      <p className="muted">
                        {job.volume} · 残压 {job.residualPressure}bar → 目标 {job.targetPressure}bar ·{" "}
                        {mixLabel(job.targetO2, job.targetHe)}（O₂ {job.targetO2}% / He {job.targetHe}%）·{" "}
                        {job.method}
                      </p>
                    </div>
                    <div className="row-actions">
                      {expired ? (
                        <button
                          className="danger"
                          onClick={() => {
                            dispatch({ type: "toInspection", id: job.id, by: state.dutyOperator });
                            setToast(`${job.id} 检验已过期，已转至送检区`);
                          }}
                        >
                          转送检区
                        </button>
                      ) : (
                        <button
                          className="primary"
                          disabled={freeSlots === 0}
                          title={freeSlots === 0 ? "充填位已满" : "接入空闲充填位"}
                          onClick={() => {
                            dispatch({ type: "assign", id: job.id, by: state.dutyOperator });
                            setToast(`${job.id} 已接入充填位`);
                          }}
                        >
                          上充填位
                        </button>
                      )}
                      <button className="ghost" onClick={() => setModal({ kind: "history", id: job.id })}>
                        历史
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="heading">
              <h2>签收与复核</h2>
              <span className="muted small">返工后合格的气瓶须复核签字才可交付</span>
            </div>
            {awaitingReview.length + awaitingSignoff.length === 0 && (
              <p className="muted">暂无待签收或待复核气瓶</p>
            )}
            <div className="stack">
              {awaitingReview.map((job) => (
                <article className="row-card row-amber" key={job.id}>
                  <div className="row-main">
                    <div className="row-title">
                      <strong>{job.id}</strong>
                      <span className="badge badge-amber">待复核 · 返工 {job.reworkCount} 次</span>
                    </div>
                    <p className="muted">{job.final ? readingText(job.final) : ""}</p>
                  </div>
                  <div className="row-actions">
                    <button className="primary" onClick={() => setModal({ kind: "review", id: job.id })}>
                      复核签字
                    </button>
                    <button className="ghost" onClick={() => setModal({ kind: "history", id: job.id })}>
                      历史
                    </button>
                  </div>
                </article>
              ))}
              {awaitingSignoff.map((job) => (
                <article className="row-card" key={job.id}>
                  <div className="row-main">
                    <div className="row-title">
                      <strong>{job.id}</strong>
                      <span className="badge badge-teal">待签收</span>
                    </div>
                    <p className="muted">{job.final ? readingText(job.final) : ""}</p>
                  </div>
                  <div className="row-actions">
                    <button className="primary" onClick={() => setModal({ kind: "signoff", id: job.id })}>
                      签收交付
                    </button>
                    <button className="ghost" onClick={() => setModal({ kind: "history", id: job.id })}>
                      历史
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="heading">
              <h2>已交付</h2>
              <span className="muted small">交付后记录关闭，不可再补记</span>
            </div>
            {delivered.length === 0 && <p className="muted">今日还没有交付记录</p>}
            <div className="stack">
              {delivered.slice(0, 8).map((job) => {
                const last = lastEvent(job);
                return (
                  <article className="row-card row-done" key={job.id}>
                    <div className="row-main">
                      <div className="row-title">
                        <strong>{job.id}</strong>
                        <span className="badge badge-green">已交付</span>
                        {job.reworkCount > 0 && (
                          <span className="badge badge-gray">返工 {job.reworkCount} 次</span>
                        )}
                      </div>
                      <p className="muted">
                        {job.final ? readingText(job.final) : ""} · {fmtTime(last.at)} {last.by}
                      </p>
                    </div>
                    <div className="row-actions">
                      <button className="ghost" onClick={() => setModal({ kind: "history", id: job.id })}>
                        历史
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <footer className="footer">所有记录保存在本机浏览器，刷新后保留 · 端口 62010</footer>

      {modal?.kind === "params" && modalJob && (
        <ParamsModal
          job={modalJob}
          onClose={() => setModal(null)}
          onSubmit={(draft) => {
            dispatch({ type: "record", id: modalJob.id, draft, by: state.dutyOperator });
            setToast(`${modalJob.id} 参数已录入`);
            setModal(null);
          }}
        />
      )}
      {modal?.kind === "finish" && modalJob && (
        <FinishModal
          job={modalJob}
          onClose={() => setModal(null)}
          onSubmit={(reading) => {
            const issues = outOfRange(modalJob, reading);
            dispatch({ type: "finish", id: modalJob.id, reading, by: state.dutyOperator });
            setToast(
              issues.length > 0
                ? `${modalJob.id} 收尾超差，已进入返工`
                : modalJob.reworkCount > 0
                  ? `${modalJob.id} 返工后合格，待复核签字`
                  : `${modalJob.id} 收尾合格，待签收`
            );
            setModal(null);
          }}
        />
      )}
      {modal?.kind === "signoff" && modalJob && (
        <SignModal
          title={`签收交付 · ${modalJob.id}`}
          confirmLabel="确认签收"
          defaultName={state.dutyOperator}
          hint={modalJob.final ? readingText(modalJob.final) : ""}
          onClose={() => setModal(null)}
          onConfirm={(name) => {
            dispatch({ type: "signoff", id: modalJob.id, by: name });
            setToast(`${modalJob.id} 已签收交付`);
            setModal(null);
          }}
        />
      )}
      {modal?.kind === "review" && modalJob && (
        <SignModal
          title={`返工复核 · ${modalJob.id}`}
          confirmLabel="复核签字并交付"
          defaultName=""
          placeholder="复核人签字（必填）"
          hint={`该气瓶返工 ${modalJob.reworkCount} 次，${modalJob.final ? readingText(modalJob.final) : ""}。须复核人签字后才可交付。`}
          onClose={() => setModal(null)}
          onConfirm={(name) => {
            dispatch({ type: "review", id: modalJob.id, by: name });
            setToast(`${modalJob.id} 复核签字完成，已交付`);
            setModal(null);
          }}
        />
      )}
      {modal?.kind === "handover" && (
        <HandoverModal
          state={state}
          onClose={() => setModal(null)}
          onConfirm={(to, count) => {
            dispatch({ type: "handover", to, by: state.dutyOperator });
            setToast(count > 0 ? `已交接给 ${to}，共 ${count} 项在制作业` : `值班员已切换为 ${to}`);
            setModal(null);
          }}
        />
      )}
      {modal?.kind === "history" && modalJob && (
        <HistoryModal job={modalJob} onClose={() => setModal(null)} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function lastEvent(job: Job) {
  return job.events[job.events.length - 1];
}

// ---------- 通用小组件 ----------

function ExpiryTag({ expiry }: { expiry: string }) {
  const d = daysUntil(expiry);
  if (d < 0) return <span className="tag tag-red">检验已过期 {-d} 天</span>;
  if (d <= 30) return <span className="tag tag-amber">检验剩余 {d} 天</span>;
  return <span className="tag">检验 {expiry}</span>;
}

function ModalBox({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="ghost" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- 登记新气瓶 ----------

function RegisterForm({
  existingIds,
  onSubmit,
}: {
  existingIds: Set<string>;
  onSubmit: (
    input: {
      id: string;
      volume: string;
      inspectionExpiry: string;
      residualPressure: number;
      targetPressure: number;
      targetO2: number;
      targetHe: number;
      method: FillMethod;
    },
    expired: boolean
  ) => void;
}) {
  const [id, setId] = useState("");
  const [volume, setVolume] = useState(VOLUMES[0]);
  const [expiry, setExpiry] = useState(localDateStr(new Date(Date.now() + 180 * 86400000)));
  const [residual, setResidual] = useState("50");
  const [targetP, setTargetP] = useState("200");
  const [o2, setO2] = useState("20.9");
  const [he, setHe] = useState("0");
  const [method, setMethod] = useState<FillMethod>("空气");
  const [err, setErr] = useState("");

  const o2Num = Number(o2);
  const heNum = Number(he);
  const expired = expiry ? isExpired(expiry) : false;

  const mixWarnings: string[] = [];
  if (Number.isFinite(o2Num) && Number.isFinite(heNum)) {
    if (o2Num + heNum > 100) mixWarnings.push("O₂ + He 超过 100%，请检查比例");
    if (method === "空气" && (o2Num > 21.4 || heNum > 0))
      mixWarnings.push("充填方式选了「空气」，但气体比例不是空气");
    if (method === "高氧" && (heNum > 0 || o2Num <= 21.4))
      mixWarnings.push("充填方式选了「高氧」，但比例不像高氧");
    if (method === "Trimix" && heNum <= 0) mixWarnings.push("充填方式选了「Trimix」，但 He 为 0");
  }

  const submit = () => {
    const rid = id.trim();
    if (!rid) return setErr("请填写气瓶编号");
    if (existingIds.has(rid)) return setErr(`编号 ${rid} 已存在，请勿重复登记`);
    if (!expiry) return setErr("请选择检验有效期");
    const nums: [string, number][] = [
      ["残压", Number(residual)],
      ["目标压力", Number(targetP)],
      ["目标 O₂", Number(o2)],
      ["目标 He", Number(he)],
    ];
    for (const [label, v] of nums) {
      if (!Number.isFinite(v) || v < 0) return setErr(`${label} 需为非负数字`);
    }
    if (Number(targetP) <= 0) return setErr("目标压力需大于 0");
    if (o2Num > 100 || heNum > 100 || o2Num + heNum > 100) return setErr("O₂ / He 比例不合法");
    setErr("");
    onSubmit(
      {
        id: rid,
        volume,
        inspectionExpiry: expiry,
        residualPressure: Number(residual),
        targetPressure: Number(targetP),
        targetO2: o2Num,
        targetHe: heNum,
        method,
      },
      expired
    );
    setId("");
    setResidual("50");
  };

  return (
    <section className="panel">
      <div className="heading">
        <h2>登记气瓶</h2>
        <span className="muted small">先按检验有效期分流</span>
      </div>
      <div className="form-grid">
        <label>
          <span>气瓶编号</span>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="如 TANK-240" />
        </label>
        <label>
          <span>容积</span>
          <select value={volume} onChange={(e) => setVolume(e.target.value)}>
            {VOLUMES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          <span>检验有效期</span>
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </label>
        <label>
          <span>残压 (bar)</span>
          <input type="number" min="0" value={residual} onChange={(e) => setResidual(e.target.value)} />
        </label>
        <label>
          <span>目标压力 (bar)</span>
          <input type="number" min="0" value={targetP} onChange={(e) => setTargetP(e.target.value)} />
        </label>
        <label>
          <span>充填方式</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as FillMethod)}>
            {FILL_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          <span>目标 O₂ (%)</span>
          <input type="number" step="0.1" min="0" max="100" value={o2} onChange={(e) => setO2(e.target.value)} />
        </label>
        <label>
          <span>目标 He (%)</span>
          <input type="number" step="0.1" min="0" max="100" value={he} onChange={(e) => setHe(e.target.value)} />
        </label>
      </div>

      <div className={`mix-hint ${mixWarnings.length ? "mix-warn" : ""}`}>
        <b>{mixLabel(o2Num, heNum)}</b>
        {modHint(o2Num) && <span> · {modHint(o2Num)}</span>}
        {mixWarnings.map((w) => (
          <p key={w}>⚠ {w}</p>
        ))}
      </div>

      {expired && (
        <div className="expired-alert">⚠ 检验有效期 {expiry} 已过期：登记后将直接进入送检区，不能占用当日充填位。</div>
      )}
      {err && <p className="error-text">{err}</p>}

      <button className="primary wide" onClick={submit}>
        {expired ? "登记并送入送检区" : "登记入队"}
      </button>
    </section>
  );
}

// ---------- 充填位卡片 ----------

function SlotCard({
  index,
  job,
  onOpen,
}: {
  index: number;
  job: Job | null;
  onOpen: (m: Modal) => void;
}) {
  if (!job) {
    return (
      <article className="slot slot-empty">
        <header>
          <b>充填位 #{index + 1}</b>
          <span className="badge badge-gray">空闲</span>
        </header>
        <p className="muted">从「待充填队列」接入气瓶</p>
      </article>
    );
  }
  const rework = job.status === "rework";
  return (
    <article className={`slot ${rework ? "slot-rework" : ""}`}>
      <header>
        <b>充填位 #{index + 1}</b>
        <span className={`badge ${rework ? "badge-red" : "badge-teal"}`}>{STATUS_LABEL[job.status]}</span>
      </header>
      <div className="slot-title">
        <strong>{job.id}</strong>
        <span className="muted">
          {job.volume} · {mixLabel(job.targetO2, job.targetHe)}
        </span>
      </div>
      <p className="muted small">
        目标 {job.targetPressure}bar · O₂ {job.targetO2}% · He {job.targetHe}% · {job.method}
      </p>
      <p className="muted small">已录参数：{summarizeDraft(job.draft)}</p>
      <p className="muted small">操作员：{job.operator}</p>
      <ExpiryTag expiry={job.inspectionExpiry} />
      {rework && job.lastIssues.length > 0 && (
        <div className="issue-box">
          <b>上次收尾超差：</b>
          <ul>
            {job.lastIssues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="slot-actions">
        <button onClick={() => onOpen({ kind: "params", id: job.id })}>录入参数</button>
        <button className="primary" onClick={() => onOpen({ kind: "finish", id: job.id })}>
          {rework ? "返工收尾" : "收尾"}
        </button>
        <button className="ghost" onClick={() => onOpen({ kind: "history", id: job.id })}>
          历史
        </button>
      </div>
    </article>
  );
}

// ---------- 弹窗：录入参数 ----------

function ParamsModal({
  job,
  onClose,
  onSubmit,
}: {
  job: Job;
  onClose: () => void;
  onSubmit: (draft: Partial<FinalReading>) => void;
}) {
  const [pressure, setPressure] = useState("");
  const [o2, setO2] = useState("");
  const [he, setHe] = useState("");
  const [method, setMethod] = useState<"" | FillMethod>("");
  const [err, setErr] = useState("");

  const submit = () => {
    const draft: Partial<FinalReading> = {};
    if (pressure.trim() !== "") {
      const v = Number(pressure);
      if (!Number.isFinite(v) || v < 0) return setErr("压力需为非负数字");
      draft.pressure = v;
    }
    if (o2.trim() !== "") {
      const v = Number(o2);
      if (!Number.isFinite(v) || v < 0 || v > 100) return setErr("O₂ 需在 0–100 之间");
      draft.o2 = v;
    }
    if (he.trim() !== "") {
      const v = Number(he);
      if (!Number.isFinite(v) || v < 0 || v > 100) return setErr("He 需在 0–100 之间");
      draft.he = v;
    }
    if (method) draft.method = method;
    if (Object.keys(draft).length === 0) return setErr("至少填写一项参数");
    onSubmit(draft);
  };

  return (
    <ModalBox title={`录入参数 · ${job.id}`} onClose={onClose}>
      <p className="muted small">留空的项目不更新；已录参数会随换班一起交接。</p>
      <p className="muted small">当前已录：{summarizeDraft(job.draft)}</p>
      <div className="form-grid">
        <label>
          <span>实测压力 (bar)</span>
          <input type="number" value={pressure} onChange={(e) => setPressure(e.target.value)} placeholder="留空不更新" />
        </label>
        <label>
          <span>实测 O₂ (%)</span>
          <input type="number" step="0.1" value={o2} onChange={(e) => setO2(e.target.value)} placeholder="留空不更新" />
        </label>
        <label>
          <span>实测 He (%)</span>
          <input type="number" step="0.1" value={he} onChange={(e) => setHe(e.target.value)} placeholder="留空不更新" />
        </label>
        <label>
          <span>充填方式</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as "" | FillMethod)}>
            <option value="">不更新</option>
            {FILL_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      {err && <p className="error-text">{err}</p>}
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>
          取消
        </button>
        <button className="primary" onClick={submit}>
          保存参数
        </button>
      </div>
    </ModalBox>
  );
}

// ---------- 弹窗：收尾 ----------

function FinishModal({
  job,
  onClose,
  onSubmit,
}: {
  job: Job;
  onClose: () => void;
  onSubmit: (reading: FinalReading) => void;
}) {
  const [pressure, setPressure] = useState(String(job.draft.pressure ?? job.targetPressure));
  const [o2, setO2] = useState(String(job.draft.o2 ?? job.targetO2));
  const [he, setHe] = useState(String(job.draft.he ?? job.targetHe));
  const [method, setMethod] = useState<FillMethod>(job.draft.method ?? job.method);
  const [err, setErr] = useState("");

  const submit = () => {
    const p = Number(pressure);
    const o = Number(o2);
    const h = Number(he);
    if (pressure.trim() === "" || o2.trim() === "" || he.trim() === "")
      return setErr("实测压力、O₂、He 均需填写");
    if (![p, o, h].every(Number.isFinite)) return setErr("请输入有效数字");
    if (p < 0 || o < 0 || o > 100 || h < 0 || h > 100 || o + h > 100) return setErr("数值超出合理范围");
    onSubmit({ pressure: p, o2: o, he: h, method });
  };

  return (
    <ModalBox title={`${job.status === "rework" ? "返工收尾" : "收尾"} · ${job.id}`} onClose={onClose}>
      <p className="muted small">
        目标区间：压力 {job.targetPressure}±{TOLERANCE.pressure}bar · O₂ {job.targetO2}±{TOLERANCE.o2}% · He{" "}
        {job.targetHe}±{TOLERANCE.he}% · 方式 {job.method}
      </p>
      <p className="muted small">任一项超出目标区间即进入返工。</p>
      <div className="form-grid">
        <label>
          <span>实测压力 (bar)</span>
          <input type="number" value={pressure} onChange={(e) => setPressure(e.target.value)} />
        </label>
        <label>
          <span>实测 O₂ (%)</span>
          <input type="number" step="0.1" value={o2} onChange={(e) => setO2(e.target.value)} />
        </label>
        <label>
          <span>实测 He (%)</span>
          <input type="number" step="0.1" value={he} onChange={(e) => setHe(e.target.value)} />
        </label>
        <label>
          <span>充填方式</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as FillMethod)}>
            {FILL_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      {err && <p className="error-text">{err}</p>}
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>
          取消
        </button>
        <button className="primary" onClick={submit}>
          提交收尾
        </button>
      </div>
    </ModalBox>
  );
}

// ---------- 弹窗：签收 / 复核签字 ----------

function SignModal({
  title,
  hint,
  confirmLabel,
  defaultName,
  placeholder,
  onClose,
  onConfirm,
}: {
  title: string;
  hint: string;
  confirmLabel: string;
  defaultName: string;
  placeholder?: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [err, setErr] = useState("");

  return (
    <ModalBox title={title} onClose={onClose}>
      <p className="muted small">{hint}</p>
      <label>
        <span>签字人</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder ?? "签字人姓名"}
        />
      </label>
      {err && <p className="error-text">{err}</p>}
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          onClick={() => {
            if (!name.trim()) return setErr("签字人不能为空");
            onConfirm(name.trim());
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalBox>
  );
}

// ---------- 弹窗：换班交接 ----------

function HandoverModal({
  state,
  onClose,
  onConfirm,
}: {
  state: State;
  onClose: () => void;
  onConfirm: (to: string, count: number) => void;
}) {
  const [to, setTo] = useState("");
  const [err, setErr] = useState("");
  const inProgress = Object.values(state.jobs).filter(
    (j) => j.status === "filling" || j.status === "rework"
  );

  return (
    <ModalBox title="换班交接" onClose={onClose}>
      <p className="muted small">
        当前值班：{state.dutyOperator}。交接后在制作业保持打开，连同已录参数转到下一班，不能关闭后再补记。
      </p>
      {inProgress.length === 0 ? (
        <p className="muted">当前无在制作业，仅切换值班员。</p>
      ) : (
        <div className="stack">
          {inProgress.map((j) => (
            <div className="handover-item" key={j.id}>
              <b>{j.id}</b>
              <span className={`badge ${j.status === "rework" ? "badge-red" : "badge-teal"}`}>
                {STATUS_LABEL[j.status]}
              </span>
              <span className="muted small">已录参数：{summarizeDraft(j.draft)}</span>
            </div>
          ))}
        </div>
      )}
      <label>
        <span>下一班值班员</span>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="接班操作员姓名" />
      </label>
      {err && <p className="error-text">{err}</p>}
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          onClick={() => {
            const name = to.trim();
            if (!name) return setErr("请填写接班值班员");
            if (name === state.dutyOperator) return setErr("接班人与当前值班相同");
            onConfirm(name, inProgress.length);
          }}
        >
          确认交接
        </button>
      </div>
    </ModalBox>
  );
}

// ---------- 弹窗：单瓶历史 ----------

function HistoryModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const events = [...job.events].reverse();
  return (
    <ModalBox title={`历史记录 · ${job.id}`} onClose={onClose}>
      <p className="muted small">
        {job.volume} · 目标 {job.targetPressure}bar / O₂ {job.targetO2}% / He {job.targetHe}% / {job.method} ·
        当前状态：{STATUS_LABEL[job.status]}
        {job.status === "delivered" && "（已关闭，不可补记）"}
      </p>
      <div className="timeline">
        {events.map((e, i) => (
          <div className={`timeline-item ev-${e.type}`} key={`${e.at}-${i}`}>
            <div className="timeline-dot" />
            <div>
              <div className="timeline-head">
                <b>{EVENT_LABEL[e.type]}</b>
                <span className="muted small">
                  {fmtTime(e.at)} · {e.by}
                </span>
              </div>
              <p className="muted small">{e.note}</p>
            </div>
          </div>
        ))}
      </div>
    </ModalBox>
  );
}
