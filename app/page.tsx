'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────
interface TankInfo { id: number; status: string; level: number; pumpStatus: string; }
interface TankData { tanks: TankInfo[]; }
interface ValveMode { id: number; name: string; valve1:number; valve2:number; valve3:number; valve4:number; valve5:number; valve6:number; valve7:number; valve8:number; }
interface WorkLog { id: string; taskType?: string; deviceId?: string; status: string; startTime: string; endTime?: string; description?: string; }
interface AutomationStatus { status: string; progress: number; currentStep?: number; totalSteps?: number; }

const API = process.env.NEXT_PUBLIC_API_URL || 'http://10.0.1.2:3000';
const POLL_MS = 5000;

// ─────────────────────────────────────────────────
// Tab type
// ─────────────────────────────────────────────────
type Tab = 'home' | 'control' | 'process' | 'log';

// ─────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────
function useTankData() {
  const [data, setData] = useState<TankData | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/tank-data`, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      setData(await r.json());
      setError(false);
    } catch { setError(true); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  return { data, error, reload: load };
}

function useValveModes() {
  const [modes, setModes] = useState<ValveMode[]>([]);
  useEffect(() => {
    fetch(`${API}/api/v1/valve-modes`)
      .then(r => r.json())
      .then(d => setModes(d.modes || d || []))
      .catch(() => {});
  }, []);
  return modes;
}

function useWorkLogs() {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/work-logs`);
      const d = await r.json();
      setLogs(d.logs || []);
    } catch {}
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);
  return { logs, reload: load };
}

// ─────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────
async function setPump(pumpId: number, on: boolean) {
  const topic = `dnature/factory/zone1/pump/inverter${pumpId}/command`;
  await fetch(`${API}/api/v1/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, payload: JSON.stringify({ command: on ? 'start' : 'stop', pump_id: pumpId }) }),
  }).catch(() => {});
}

async function applyValveMode(modeId: number) {
  await fetch(`${API}/api/v1/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: 'dnature/factory/zone1/valve/set_valve/SIM_VALVE_01',
      payload: JSON.stringify({ command: 'set_valve', mode_index: modeId }),
    }),
  }).catch(() => {});
}

async function emergencyStop() {
  await fetch(`${API}/api/v1/commands/emergency-stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'mobile_emergency' }),
  }).catch(async () => {
    // fallback: stop all pumps individually
    for (let i = 1; i <= 6; i++) await setPump(i, false);
  });
}

// ─────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  const cfg =
    s === 'on' || s === 'running' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
    s === 'completed'             ? 'bg-green-500/20 text-green-300 border-green-500/40' :
    s === 'error'                 ? 'bg-red-500/20 text-red-300 border-red-500/40' :
    s === 'stopped'               ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                                    'bg-slate-700/40 text-slate-400 border-slate-600/40';
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${cfg}`}>
      {status || '—'}
    </span>
  );
}

// ─────────────────────────────────────────────────
// Home Tab
// ─────────────────────────────────────────────────
function HomeTab({ data, error }: { data: TankData | null; error: boolean }) {
  if (error) return (
    <div className="flex flex-col items-center py-16 text-slate-500">
      <div className="text-4xl mb-3">📡</div>
      <div className="text-sm">서버 연결 실패</div>
      <div className="text-xs mt-1">{API}</div>
    </div>
  );
  if (!data?.tanks?.length) return (
    <div className="flex flex-col items-center py-16 text-slate-500">
      <div className="text-4xl mb-3 animate-pulse">⟳</div>
      <div className="text-sm">데이터 로딩중...</div>
    </div>
  );

  return (
    <div className="space-y-3 pb-6">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">탱크 현황</div>
      <div className="grid grid-cols-2 gap-2">
        {data.tanks.map(tank => {
          const on = tank.pumpStatus === 'ON';
          const lv = tank.level || 0;
          const color = lv <= 20 ? '#ef4444' : lv <= 60 ? '#f59e0b' : '#22c55e';
          return (
            <div key={tank.id}
              className={`rounded-2xl p-3 border transition-all ${on ? 'bg-blue-950/60 border-blue-500/50' : 'bg-slate-800/60 border-slate-700/50'}`}>
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-bold text-slate-200">{tank.id}번탱크</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${on ? 'bg-blue-500 text-white' : 'bg-slate-600 text-slate-300'}`}>
                  {on ? '가동' : '정지'}
                </span>
              </div>
              {/* gauge bar */}
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mb-1">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${lv}%`, backgroundColor: color }} />
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-slate-400">{tank.status || 'empty'}</span>
                <span className="text-[10px] font-bold" style={{ color }}>{lv}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Control Tab
// ─────────────────────────────────────────────────
function ControlTab({ data, modes }: { data: TankData | null; modes: ValveMode[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [valveMode, setValveMode] = useState<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handlePump = async (id: number, on: boolean) => {
    setBusy(id);
    await setPump(id, on);
    showToast(`펌프 ${id} ${on ? 'ON' : 'OFF'} 명령 발행`);
    setBusy(null);
  };

  const handleValveMode = async (modeId: number) => {
    setValveMode(modeId);
    await applyValveMode(modeId);
    showToast(`밸브 모드 #${modeId} 적용`);
  };

  const tanks = data?.tanks || [];

  return (
    <div className="space-y-5 pb-6">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 rounded-xl px-4 py-2 text-sm text-slate-200 shadow-xl">
          {toast}
        </div>
      )}

      {/* 인버터 펌프 */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">인버터 펌프</div>
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3,4,5,6].map(id => {
            const tank = tanks.find(t => t.id === id);
            const on = tank?.pumpStatus === 'ON';
            return (
              <button key={id}
                disabled={busy === id}
                onClick={() => handlePump(id, !on)}
                className={`rounded-2xl p-3 border text-center transition-all active:scale-95 ${
                  on ? 'bg-blue-600/40 border-blue-500/60 text-blue-200' :
                       'bg-slate-800/60 border-slate-700/50 text-slate-400'
                } ${busy === id ? 'opacity-50' : ''}`}>
                <div className="text-base font-bold mb-0.5">P{id}</div>
                <div className={`text-[11px] font-semibold ${on ? 'text-blue-300' : 'text-slate-500'}`}>
                  {busy === id ? '...' : on ? '가동' : '정지'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 밸브 모드 */}
      {modes.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">밸브 모드</div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {modes.slice(0, 20).map(m => (
              <button key={m.id}
                onClick={() => handleValveMode(m.id)}
                className={`w-full rounded-xl px-3 py-2 text-left border transition-all active:scale-[0.98] ${
                  valveMode === m.id
                    ? 'bg-purple-900/60 border-purple-500/60 text-purple-200'
                    : 'bg-slate-800/60 border-slate-700/40 text-slate-300'
                }`}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{m.name}</span>
                  <span className="text-[10px] text-slate-500">
                    [{m.valve1}{m.valve2}{m.valve3}{m.valve4}{m.valve5}{m.valve6}{m.valve7}{m.valve8}]
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────
// Process Tab
// ─────────────────────────────────────────────────
function ProcessTab() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${API}/api/automation/status`, { cache: 'no-store' });
        if (r.ok) setStatus(await r.json());
      } catch {}
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const prog = status?.progress ?? 0;
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference * (1 - prog / 100);

  return (
    <div className="space-y-4 pb-6">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">공정 진행 현황</div>

      {/* 원형 progress */}
      <div className="flex flex-col items-center py-4">
        <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
          <circle cx="50" cy="50" r="36" fill="none" stroke="#1e293b" strokeWidth="8"/>
          <circle cx="50" cy="50" r="36" fill="none"
            stroke={prog >= 90 ? '#22c55e' : prog >= 50 ? '#3b82f6' : prog > 0 ? '#eab308' : '#475569'}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div className="text-3xl font-bold text-white -mt-16">{prog}%</div>
        <div className="mt-12 text-sm text-slate-400">
          {status?.status || '대기중'}
        </div>
      </div>

      {/* 단계 정보 */}
      {status?.currentStep !== undefined && (
        <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1">진행 단계</div>
          <div className="text-lg font-bold text-slate-200">
            {status.currentStep} / {status.totalSteps ?? '?'}
          </div>
          {/* progress bar */}
          <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${prog}%` }} />
          </div>
        </div>
      )}

      {!status && (
        <div className="text-center text-slate-500 py-8 text-sm">
          공정 정보를 불러오는 중...
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────
// Log Tab
// ─────────────────────────────────────────────────
function LogTab({ logs, reload }: { logs: WorkLog[]; reload: () => void }) {
  return (
    <div className="space-y-2 pb-6">
      <div className="flex justify-between items-center mb-1">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">작업 로그북</div>
        <button onClick={reload}
          className="text-[11px] text-slate-500 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 active:scale-95">
          새로고침
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="text-center text-slate-500 py-10 text-sm">로그 없음</div>
      ) : logs.map(log => (
        <div key={log.id}
          className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 space-y-1">
          <div className="flex justify-between items-start">
            <span className="text-xs text-slate-300 font-medium">
              {log.taskType || log.deviceId || '—'}
            </span>
            <StatusBadge status={log.status} />
          </div>
          {log.description && (
            <div className="text-[11px] text-slate-400 line-clamp-2">{log.description}</div>
          )}
          <div className="text-[10px] text-slate-600">
            {log.startTime ? new Date(log.startTime).toLocaleString('ko-KR') : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────
export default function MobileDashboard() {
  const [tab, setTab] = useState<Tab>('home');
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);
  const [emergencyBusy, setEmergencyBusy] = useState(false);
  const [eToast, setEToast] = useState('');

  const { data, error, reload } = useTankData();
  const modes = useValveModes();
  const { logs, reload: reloadLogs } = useWorkLogs();

  const connected = !error && !!data;

  const handleEmergencyStop = async () => {
    setEmergencyBusy(true);
    await emergencyStop();
    setShowEmergencyConfirm(false);
    setEmergencyBusy(false);
    setEToast('🔴 비상정지 명령 발행완료');
    setTimeout(() => setEToast(''), 3000);
    reload();
  };

  const tabCfg: { id: Tab; label: string; icon: string }[] = [
    { id: 'home',    label: '홈',  icon: '🏠' },
    { id: 'control', label: '제어', icon: '🎛' },
    { id: 'process', label: '공정', icon: '⚙️' },
    { id: 'log',     label: '로그', icon: '📋' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 px-4 pt-safe-top">
        <div className="flex justify-between items-center h-14">
          <div>
            <div className="text-base font-bold text-slate-100">D-nature</div>
            <div className="text-[10px] text-slate-500">CMXF 모바일 제어</div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full transition-colors ${connected ? 'bg-emerald-400' : 'bg-red-500'}`}/>
            <span className="text-[11px] text-slate-400">{connected ? '연결됨' : '오프라인'}</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 pt-4">
        {tab === 'home'    && <HomeTab data={data} error={error} />}
        {tab === 'control' && <ControlTab data={data} modes={modes} />}
        {tab === 'process' && <ProcessTab />}
        {tab === 'log'     && <LogTab logs={logs} reload={reloadLogs} />}
      </main>

      {/* Emergency Stop FAB */}
      <button
        onClick={() => setShowEmergencyConfirm(true)}
        className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 shadow-lg shadow-red-900/50 flex items-center justify-center transition-all">
        <span className="text-xl">🛑</span>
      </button>

      {/* Emergency confirm modal */}
      {showEmergencyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-red-900/60 rounded-2xl p-6 w-full max-w-xs text-center shadow-2xl">
            <div className="text-4xl mb-3">🛑</div>
            <div className="text-lg font-bold text-red-400 mb-1">비상정지</div>
            <div className="text-sm text-slate-400 mb-6">모든 펌프를 즉시 정지합니다.<br/>계속하시겠습니까?</div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEmergencyConfirm(false)}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-medium text-sm active:scale-95">
                취소
              </button>
              <button
                disabled={emergencyBusy}
                onClick={handleEmergencyStop}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold text-sm active:scale-95 disabled:opacity-60">
                {emergencyBusy ? '전송중...' : '정지'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency toast */}
      {eToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-700 rounded-xl px-4 py-2 text-sm text-red-200 shadow-xl">
          {eToast}
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="sticky bottom-0 z-30 bg-slate-950/95 backdrop-blur-sm border-t border-slate-800 pb-safe-bottom">
        <div className="flex">
          {tabCfg.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors ${
                tab === t.id ? 'text-blue-400' : 'text-slate-500'
              }`}>
              <span className="text-xl">{t.icon}</span>
              <span className="text-[10px] font-semibold">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
