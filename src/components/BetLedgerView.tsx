import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  FileText,
  Sliders,
  AlertTriangle,
  Layers,
  Lock,
} from 'lucide-react';
import {
  getBetLedger,
  updateBetResult,
  calculateStopLossFromLedger,
  getModelAuditTrail,
  BetLedgerEntry,
  ModelAuditTrailRecord,
  StopLossStatus,
} from '../lib/betLedger';

export const BetLedgerView: React.FC = () => {
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'ledger' | 'audit' | 'config'>('ledger');

  // Ledger state
  const [bets, setBets] = useState<BetLedgerEntry[]>([]);
  const [auditRecords, setAuditRecords] = useState<ModelAuditTrailRecord[]>([]);
  const [stopLossStatus, setStopLossStatus] = useState<StopLossStatus>({
    dailyLoss: 0,
    dailyProfitLoss: 0,
    betsEvaluated: 0,
    isStopLossReached: false,
    remainingAllowedLoss: 100,
  });

  // Stop loss configuration
  const [stopLossLimit, setStopLossLimit] = useState<number>(100);
  const [bankroll, setBankroll] = useState<number>(1000);

  const loadData = () => {
    const list = getBetLedger(isDemoMode);
    setBets(list);
    const sl = calculateStopLossFromLedger(isDemoMode, {
      dailyStopLossMoney: stopLossLimit,
      bankroll,
    });
    setStopLossStatus(sl);
    const audit = getModelAuditTrail();
    setAuditRecords(audit);
  };

  useEffect(() => {
    loadData();
  }, [isDemoMode, stopLossLimit, bankroll]);

  const handleUpdateResult = (betId: string, result: 'GANADA' | 'PERDIDA' | 'ANULADA') => {
    updateBetResult(betId, result, isDemoMode);
    loadData();
  };

  return (
    <div className="space-y-6">
      {/* Header and Mode Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-tight">
              Registro de Apuestas y Pista de Auditoría (P0)
            </h2>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${
                isDemoMode
                  ? 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
              }`}
            >
              MODO {isDemoMode ? 'DEMO (SIMULADO)' : 'REAL (PRODUCCIÓN)'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gestión cuantitativa de bankroll, control estricto de Stop-Loss diario y trazabilidad forense del modelo
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDemoMode(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors border ${
              !isDemoMode
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            Modo REAL
          </button>
          <button
            onClick={() => setIsDemoMode(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors border ${
              isDemoMode
                ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            Modo DEMO
          </button>
        </div>
      </div>

      {/* Stop Loss Banner if reached */}
      {stopLossStatus.isStopLossReached && (
        <div className="bg-rose-950/90 border-2 border-rose-500/80 rounded-xl p-4 flex items-start gap-3 text-rose-200 shadow-xl animate-pulse">
          <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              STOP-LOSS DIARIO ALCANZADO — OPERACIONES BLOQUEADAS
            </h3>
            <p className="text-xs">
              {stopLossStatus.stopLossReason ||
                `Pérdida acumulada del día ($${stopLossStatus.dailyLoss.toFixed(2)}) ha alcanzado el límite permitido ($${stopLossLimit.toFixed(2)}). Todas las señales de apuesta quedan anuladas automáticamente.`}
            </p>
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-[11px] text-slate-400 font-mono">PnL NETO HOY</div>
          <div
            className={`text-2xl font-bold font-mono mt-1 ${
              stopLossStatus.dailyProfitLoss > 0
                ? 'text-emerald-400'
                : stopLossStatus.dailyProfitLoss < 0
                ? 'text-rose-400'
                : 'text-slate-200'
            }`}
          >
            {stopLossStatus.dailyProfitLoss > 0 ? '+' : ''}${stopLossStatus.dailyProfitLoss.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            {stopLossStatus.betsEvaluated} apuestas liquidadas
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-[11px] text-slate-400 font-mono">LÍMITE STOP-LOSS</div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            ${stopLossLimit.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Margen restante: ${stopLossStatus.remainingAllowedLoss.toFixed(2)}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-[11px] text-slate-400 font-mono">ESTADO DEL RIESGO</div>
          <div className="flex items-center gap-1.5 mt-1">
            {stopLossStatus.isStopLossReached ? (
              <span className="text-rose-400 font-bold font-mono flex items-center gap-1 text-sm">
                <Lock className="w-4 h-4" /> BLOQUEADO
              </span>
            ) : (
              <span className="text-emerald-400 font-bold font-mono flex items-center gap-1 text-sm">
                <ShieldCheck className="w-4 h-4" /> SEGURO
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Tope de exposición activo
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-[11px] text-slate-400 font-mono">REGISTROS FORENSES</div>
          <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
            {auditRecords.length}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Decisiones auditadas
          </div>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveSubTab('ledger')}
          className={`px-4 py-2.5 text-xs font-semibold font-mono border-b-2 transition-colors ${
            activeSubTab === 'ledger'
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Libro de Apuestas ({bets.length})
        </button>
        <button
          onClick={() => setActiveSubTab('audit')}
          className={`px-4 py-2.5 text-xs font-semibold font-mono border-b-2 transition-colors ${
            activeSubTab === 'audit'
              ? 'border-cyan-500 text-cyan-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Model Audit Trail ({auditRecords.length})
        </button>
        <button
          onClick={() => setActiveSubTab('config')}
          className={`px-4 py-2.5 text-xs font-semibold font-mono border-b-2 transition-colors ${
            activeSubTab === 'config'
              ? 'border-amber-500 text-amber-400 bg-slate-900/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Ajustes de Riesgo y Stop-Loss
        </button>
      </div>

      {/* Subtab Content: Bet Ledger */}
      {activeSubTab === 'ledger' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              Historial de Apuestas Registradas
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              Persistencia local inmutable
            </span>
          </div>

          {bets.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
              No hay apuestas registradas en modo {isDemoMode ? 'DEMO' : 'REAL'}.
              Las apuestas ejecutadas desde el Terminal Cuantitativo o In-Play se registrarán aquí.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Fecha/Hora</th>
                    <th className="py-2.5 px-3">Partido</th>
                    <th className="py-2.5 px-3">Mercado</th>
                    <th className="py-2.5 px-3">Selección</th>
                    <th className="py-2.5 px-3">Cuota</th>
                    <th className="py-2.5 px-3">Stake ($)</th>
                    <th className="py-2.5 px-3">Resultado</th>
                    <th className="py-2.5 px-3">PnL ($)</th>
                    <th className="py-2.5 px-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {bets.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 text-slate-400">
                        {b.timestamp.slice(0, 16).replace('T', ' ')}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-white">
                        {b.matchName || b.matchId}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{b.market}</td>
                      <td className="py-2.5 px-3 text-cyan-300 font-semibold">{b.selection}</td>
                      <td className="py-2.5 px-3">{b.odds.toFixed(2)}</td>
                      <td className="py-2.5 px-3">${b.stake.toFixed(2)}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            b.result === 'GANADA'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : b.result === 'PERDIDA'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : b.result === 'ANULADA'
                              ? 'bg-slate-800 text-slate-400'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {b.result}
                        </span>
                      </td>
                      <td
                        className={`py-2.5 px-3 font-bold ${
                          b.profitLoss > 0
                            ? 'text-emerald-400'
                            : b.profitLoss < 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {b.profitLoss > 0 ? '+' : ''}${b.profitLoss.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1">
                        {b.result === 'PENDIENTE' && (
                          <>
                            <button
                              onClick={() => handleUpdateResult(b.id, 'GANADA')}
                              className="px-2 py-0.5 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 rounded text-[10px] transition-colors"
                            >
                              Ganada
                            </button>
                            <button
                              onClick={() => handleUpdateResult(b.id, 'PERDIDA')}
                              className="px-2 py-0.5 bg-rose-900/60 hover:bg-rose-800 text-rose-300 rounded text-[10px] transition-colors"
                            >
                              Perdida
                            </button>
                            <button
                              onClick={() => handleUpdateResult(b.id, 'ANULADA')}
                              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] transition-colors"
                            >
                              Void
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Subtab Content: Model Audit Trail */}
      {activeSubTab === 'audit' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Model Audit Trail — Registro Forense Inmutable
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              Últimas {auditRecords.length} decisiones auditadas
            </span>
          </div>

          {auditRecords.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs font-mono">
              Aún no hay registros de auditoría forense. Evalúa un partido en el Terminal o Analizador en Vivo para registrar la trazabilidad.
            </div>
          ) : (
            <div className="space-y-3">
              {auditRecords.slice(0, 15).map((rec) => (
                <div
                  key={rec.id}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs space-y-2 hover:border-slate-700 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800/60 pb-2">
                    <span className="font-bold text-white">{rec.partido}</span>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>{rec.timestamp.replace('T', ' ').slice(0, 19)}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold ${
                          rec.veredicto === 'APOSTAR'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : rec.veredicto === 'ESPERAR'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {rec.veredicto}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-[11px] pt-1">
                    <div>
                      <span className="text-slate-500">Cuota:</span> {rec.cuota.toFixed(2)}
                    </div>
                    <div>
                      <span className="text-slate-500">Cuota Justa:</span> {rec.cuotaJusta?.toFixed(2) || 'N/A'}
                    </div>
                    <div>
                      <span className="text-slate-500">Probabilidad:</span> {rec.probabilidad?.toFixed(2)}%
                    </div>
                    <div>
                      <span className="text-slate-500">EV%:</span>{' '}
                      <span className={rec.ev >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                        {rec.ev >= 0 ? '+' : ''}{rec.ev?.toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Stake Sugerido:</span> {rec.stake?.toFixed(2)}%
                    </div>
                    <div>
                      <span className="text-slate-500">Calidad Datos:</span> {rec.calidadDeDatos}
                    </div>
                  </div>

                  {rec.lambdaDinamico && (
                    <div className="text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/60">
                      <span className="text-cyan-400">λ Dinámicos:</span> Local = {rec.lambdaDinamico.home?.toFixed(2)}, Visita = {rec.lambdaDinamico.away?.toFixed(2)} | Marcador: {rec.marcador?.home ?? 0} - {rec.marcador?.away ?? 0} | Rojas: {rec.tarjetas?.redHome ?? 0}/{rec.tarjetas?.redAway ?? 0}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subtab Content: Risk Config */}
      {activeSubTab === 'config' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 max-w-xl">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            Configuración de Límites de Riesgo (Stop-Loss)
          </h3>
          <p className="text-xs text-slate-400">
            El sistema bloqueará cualquier sugerencia de apuesta tan pronto como las pérdidas acumuladas del día alcancen este umbral.
          </p>

          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-mono text-slate-300 block mb-1">
                Límite de Pérdida Diaria ($ USD)
              </label>
              <input
                type="number"
                min="10"
                step="10"
                value={stopLossLimit}
                onChange={(e) => setStopLossLimit(Math.max(10, parseFloat(e.target.value) || 100))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-slate-300 block mb-1">
                Bankroll de Referencia ($ USD)
              </label>
              <input
                type="number"
                min="100"
                step="100"
                value={bankroll}
                onChange={(e) => setBankroll(Math.max(100, parseFloat(e.target.value) || 1000))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="pt-2">
              <button
                onClick={loadData}
                className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold font-mono text-xs transition-colors shadow-lg"
              >
                Guardar y Recalcular Stop-Loss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
