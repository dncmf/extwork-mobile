'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface SystemState {
  inverters?: Record<string, { connected: boolean; level?: number; power?: number }>;
  valves?: Record<string, boolean>;
  pumps?: Record<string, boolean>;
  tanks?: Record<string, number>;
}

export default function Home() {
  const [state, setState] = useState<SystemState>({});
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('--');

  useEffect(() => {
    fetch(`${API}/api/system-state`)
      .then(r => r.json())
      .then(data => { setState(data); setConnected(true); })
      .catch(() => setConnected(false));

    const es = new EventSource(`${API}/api/sync`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setState(data);
        setLastUpdate(new Date().toLocaleTimeString('ko-KR'));
        setConnected(true);
      } catch {}
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  const sendCommand = async (command: string, target: string, value: boolean) => {
    await fetch(`${API}/api/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, target, value }),
    }).catch(() => {});
  };

  const inverters = state.inverters ? Object.entries(state.inverters) : [];
  const valves = state.valves ? Object.entries(state.valves) : [];
  const pumps = state.pumps ? Object.entries(state.pumps) : [];

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4 max-w-md mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">D-nature 모니터</h1>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-xs text-gray-400">{connected ? '연결됨' : '연결 끊김'}</span>
        </div>
      </div>

      {/* 인버터 / 탱크 수위 */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-400 mb-3">인버터 상태</h2>
        <div className="grid grid-cols-2 gap-3">
          {inverters.length === 0 ? (
            <div className="col-span-2 text-center text-gray-500 py-4">데이터 없음</div>
          ) : inverters.map(([id, inv]) => (
            <div key={id} className="bg-gray-800 rounded-xl p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">{id}</span>
                <div className={`w-2 h-2 rounded-full ${inv.connected ? 'bg-green-400' : 'bg-gray-600'}`} />
              </div>
              {inv.level !== undefined && (
                <>
                  <div className="text-2xl font-bold">{inv.level}%</div>
                  <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${inv.level > 70 ? 'bg-green-400' : inv.level > 30 ? 'bg-yellow-400' : 'bg-red-400'}`}
                      style={{ width: `${inv.level}%` }}
                    />
                  </div>
                </>
              )}
              {inv.power !== undefined && (
                <div className="text-xs text-gray-400 mt-1">{inv.power}W</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 펌프 제어 */}
      {pumps.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">펌프</h2>
          <div className="space-y-2">
            {pumps.map(([id, isOn]) => (
              <div key={id} className="bg-gray-800 rounded-xl p-3 flex items-center justify-between">
                <span className="text-sm">{id}</span>
                <button
                  onClick={() => sendCommand('pump', id, !isOn)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${isOn ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-600 hover:bg-gray-500'}`}
                >
                  {isOn ? 'ON' : 'OFF'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 밸브 제어 */}
      {valves.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">밸브</h2>
          <div className="space-y-2">
            {valves.map(([id, isOpen]) => (
              <div key={id} className="bg-gray-800 rounded-xl p-3 flex items-center justify-between">
                <span className="text-sm">{id}</span>
                <button
                  onClick={() => sendCommand('valve', id, !isOpen)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${isOpen ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-600 hover:bg-gray-500'}`}
                >
                  {isOpen ? '열림' : '닫힘'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {inverters.length === 0 && pumps.length === 0 && valves.length === 0 && connected && (
        <div className="text-center text-gray-500 py-12">
          <div className="text-4xl mb-3">📡</div>
          <div>데이터 수신 대기 중...</div>
        </div>
      )}

      <div className="text-center text-xs text-gray-600 mt-8">
        마지막 업데이트: {lastUpdate}
      </div>
    </main>
  );
}
