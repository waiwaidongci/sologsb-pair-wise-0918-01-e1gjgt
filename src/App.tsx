import { useState } from "react";
import "./styles.css";
import { useStation } from "./state";
import type { FillOrder } from "./types";
import { ShiftBar } from "./components/ShiftBar";
import { IntakeForm } from "./components/IntakeForm";
import { InspectionPanel, QueuePanel, ReworkPanel } from "./components/Queues";
import { StationBoard } from "./components/StationBoard";
import { HandoverLog, OrderDetail, RecordsPanel } from "./components/Records";

function App() {
  const station = useStation();
  const { state, resetDemo } = station;
  const [detailId, setDetailId] = useState<string | null>(null);
  const openDetail = (o: FillOrder) => setDetailId(o.id);

  const count = (s: FillOrder["status"]) => state.orders.filter((o) => o.status === s).length;
  const metrics = [
    { label: "待充填队列", value: count("queued"), tone: "" },
    { label: "送检区（过期）", value: count("inspection"), tone: "metric-warn" },
    { label: "充填位作业中", value: count("filling"), tone: "metric-live" },
    { label: "返工待复核", value: count("rework"), tone: "metric-danger" },
  ];

  return (
    <main className="app">
      <section className="hero">
        <p>潜水店 · 值班充填台 · Port 62010</p>
        <h1>气瓶充填值班作业台</h1>
        <span>
          按检验有效期分流，过期气瓶只进送检区、不占当日充填位；每个充填位同时只承接一项未完工气瓶；
          换班时作业连同已录参数移交，不关闭、不补记；收尾实测压力/O₂/He/方式任一超差即返工，返工复核签字后才能交付。
        </span>
      </section>

      <ShiftBar station={station} />

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label} className={m.tone}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <section className="top-grid">
        <IntakeForm station={station} />
        <QueuePanel station={station} onDetail={openDetail} />
      </section>

      <StationBoard station={station} onDetail={openDetail} />

      <section className="zone-grid">
        <InspectionPanel station={station} onDetail={openDetail} />
        <ReworkPanel station={station} onDetail={openDetail} />
      </section>

      <RecordsPanel station={station} />

      <HandoverLog station={station} />

      <footer className="foot">
        <span>
          所有单据与交接记录保存在本机浏览器（localStorage），刷新或关闭后重开仍然保留。
        </span>
        <button
          onClick={() => {
            if (confirm("将清空当前本地记录并恢复演示数据，确定继续？")) resetDemo();
          }}
        >
          恢复演示数据
        </button>
      </footer>

      {detailId && (
        <OrderDetail
          orderId={detailId}
          tankRecords={false}
          station={station}
          onClose={() => setDetailId(null)}
        />
      )}
    </main>
  );
}

export default App;
