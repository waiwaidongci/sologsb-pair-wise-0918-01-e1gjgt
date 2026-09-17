import { useState } from "react";
import { fmtDateTime } from "../domain";
import type { StationApi } from "../state";
import { Field, Modal } from "./Modal";

export function ShiftBar({ station }: { station: StationApi }) {
  const { state, signIn, handover } = station;
  const [signName, setSignName] = useState("");
  const [showSign, setShowSign] = useState(false);
  const [toName, setToName] = useState("");
  const [showHandover, setShowHandover] = useState(false);

  const fillingCount = state.orders.filter((o) => o.status === "filling").length;

  return (
    <div className="shiftbar">
      <div className="shift-info">
        <span className="shift-dot" />
        {state.currentOperator ? (
          <>
            <b>{state.currentOperator}</b>
            <span className="muted">
              第 {state.shiftSeq} 班 · {state.shiftStartedAt ? fmtDateTime(state.shiftStartedAt) : ""} 起值班
            </span>
            <span className={`badge ${fillingCount ? "badge-live" : ""}`}>
              在制作业 {fillingCount} 项
            </span>
          </>
        ) : (
          <>
            <b className="muted">尚未签到</b>
            <span className="muted">签到后才能登记气瓶、记录参数与收尾交付</span>
          </>
        )}
      </div>
      <div className="shift-actions">
        {!state.currentOperator ? (
          <button className="primary" onClick={() => setShowSign(true)}>
            当班签到
          </button>
        ) : (
          <button onClick={() => setShowHandover(true)}>换班交接</button>
        )}
      </div>

      {showSign && (
        <Modal title="当班签到" onClose={() => setShowSign(false)} width={420}>
          <p className="modal-tip">签到即视为当班负责人，所有操作将以该姓名留痕。</p>
          <Field label="值班员姓名">
            <input
              autoFocus
              value={signName}
              onChange={(e) => setSignName(e.target.value)}
              placeholder="例如：王杰"
              onKeyDown={(e) => {
                if (e.key === "Enter" && signName.trim()) {
                  signIn(signName);
                  setShowSign(false);
                  setSignName("");
                }
              }}
            />
          </Field>
          <div className="modal-foot">
            <button onClick={() => setShowSign(false)}>取消</button>
            <button
              className="primary"
              disabled={!signName.trim()}
              onClick={() => {
                signIn(signName);
                setShowSign(false);
                setSignName("");
              }}
            >
              签到上岗
            </button>
          </div>
        </Modal>
      )}

      {showHandover && (
        <Modal title="换班交接" onClose={() => setShowHandover(false)} width={480}>
          <div className="handover-preview">
            <p className="hp-title">本班在制作业（随作业、已录参数一并移交，单据不关闭）</p>
            {fillingCount === 0 && <p className="muted">当前充填位无在制作业。</p>}
            {state.orders
              .filter((o) => o.status === "filling")
              .map((o) => {
                const last = o.params[o.params.length - 1];
                return (
                  <div key={o.id} className="hp-item">
                    <b>{o.tankNo}</b>
                    <span>
                      {o.slotId ? o.slotId.replace("S", "充填位 ") + " 号" : "未定位"} · {o.mode}
                    </span>
                    <span className="muted">
                      {last
                        ? `最新参数 ${last.pressure}bar / O₂ ${last.o2}% / He ${last.he}%（${last.operator} 录）`
                        : "暂无过程参数"}
                    </span>
                  </div>
                );
              })}
          </div>
          <Field label="下一班值班员姓名">
            <input
              autoFocus
              value={toName}
              onChange={(e) => setToName(e.target.value)}
              placeholder="交接给谁，填写其姓名"
            />
          </Field>
          <p className="modal-tip warn">
            交接后在制气瓶仍保持「充填中」，历史参数只读保留；已收尾记录锁定，不允许关闭后再补记。
          </p>
          <div className="modal-foot">
            <button onClick={() => setShowHandover(false)}>取消</button>
            <button
              className="primary"
              disabled={!toName.trim() || toName.trim() === state.currentOperator}
              onClick={() => {
                handover(toName);
                setShowHandover(false);
                setToName("");
              }}
            >
              确认交班
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
