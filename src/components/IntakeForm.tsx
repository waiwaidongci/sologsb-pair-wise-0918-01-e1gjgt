import { useState } from "react";
import { FILL_MODES, TOL, inspectLabel, isInspectionExpired, modeDefaults, todayStr } from "../domain";
import type { FillMode } from "../types";
import type { StationApi } from "../state";

const EMPTY = {
  tankNo: "",
  volume: "12L 铝瓶",
  inspectUntil: todayStr(),
  residualPressure: 40,
  targetPressure: 200,
  mode: "空气" as FillMode,
};

export function IntakeForm({ station }: { station: StationApi }) {
  const { state, intake, modeHint } = station;
  const [form, setForm] = useState({ ...EMPTY });
  const [targetO2, setTargetO2] = useState(21);
  const [targetHe, setTargetHe] = useState(0);
  const [touched, setTouched] = useState(false);

  const expired = isInspectionExpired(form.inspectUntil);
  const insp = inspectLabel(form.inspectUntil);
  const valid =
    form.tankNo.trim().length > 0 &&
    form.volume.trim().length > 0 &&
    form.residualPressure >= 0 &&
    form.targetPressure > form.residualPressure &&
    targetO2 >= 0 &&
    targetO2 <= 100 &&
    targetHe >= 0 &&
    targetHe <= 100;

  const changeMode = (mode: FillMode) => {
    const d = modeDefaults(mode);
    setForm((f) => ({ ...f, mode }));
    setTargetO2(d.o2);
    setTargetHe(d.he);
  };

  const submit = () => {
    setTouched(true);
    if (!valid || !state.currentOperator) return;
    intake({
      tankNo: form.tankNo.trim(),
      volume: form.volume.trim(),
      inspectUntil: form.inspectUntil,
      residualPressure: Number(form.residualPressure),
      targetPressure: Number(form.targetPressure),
      targetO2: Number(targetO2),
      targetHe: Number(targetHe),
      mode: form.mode,
    });
    setForm({ ...EMPTY });
    setTargetO2(21);
    setTargetHe(0);
    setTouched(false);
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>入店登记</p>
          <h2>气瓶分流登记</h2>
        </div>
        <span className={`route-tag ${expired ? "route-expired" : "route-ok"}`}>
          {expired ? "将分流：送检区" : "将分流：待充填队列"}
        </span>
      </div>

      <div className="chips mode-chips">
        {FILL_MODES.map((m) => (
          <button
            key={m}
            className={form.mode === m ? "chip-on" : ""}
            onClick={() => changeMode(m)}
            type="button"
          >
            {m}
          </button>
        ))}
      </div>
      <p className="mix-hint">💡 {modeHint(form.mode)}</p>

      <div className="field-grid">
        <label>
          <span>气瓶编号 *</span>
          <input
            value={form.tankNo}
            onChange={(e) => setForm({ ...form, tankNo: e.target.value })}
            placeholder="例如 TANK-240"
          />
        </label>
        <label>
          <span>容积 / 瓶型</span>
          <input value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} />
        </label>
        <label>
          <span>
            检验有效期 <em className={`insp-${insp.tone}`}>{insp.text}</em>
          </span>
          <input
            type="date"
            value={form.inspectUntil}
            onChange={(e) => setForm({ ...form, inspectUntil: e.target.value })}
          />
        </label>
        <label>
          <span>残压 (bar)</span>
          <input
            type="number"
            value={form.residualPressure}
            onChange={(e) => setForm({ ...form, residualPressure: Number(e.target.value) })}
          />
        </label>
        <label>
          <span>目标压力 (bar)</span>
          <input
            type="number"
            value={form.targetPressure}
            onChange={(e) => setForm({ ...form, targetPressure: Number(e.target.value) })}
          />
        </label>
        <label>
          <span>
            目标 O₂ / He (%) <em>收尾合格区间 ±{TOL.o2}%</em>
          </span>
          <div className="dual-input">
            <input
              type="number"
              step="0.1"
              value={targetO2}
              onChange={(e) => setTargetO2(Number(e.target.value))}
            />
            <input
              type="number"
              step="0.1"
              value={targetHe}
              onChange={(e) => setTargetHe(Number(e.target.value))}
            />
          </div>
        </label>
      </div>

      {expired && (
        <p className="route-notice expired">
          ⛔ 该气瓶检验已过期，登记后只能进入送检区，不能占用任何当日充填位；复检合格更新有效期后方可回队。
        </p>
      )}
      {!state.currentOperator && <p className="route-notice muted">请先在顶部完成当班签到再登记。</p>}
      {touched && !valid && state.currentOperator && (
        <p className="route-notice expired">请检查：编号必填，目标压力须大于残压，比例在 0–100 之间。</p>
      )}

      <button className="primary full" onClick={submit} disabled={!state.currentOperator}>
        登记并按检验有效期分流
      </button>
    </section>
  );
}
