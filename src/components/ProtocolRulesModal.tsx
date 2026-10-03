import React from 'react';
import { Shield, BookOpen, AlertCircle, CheckCircle, Scale, Database } from 'lucide-react';

export const ProtocolRulesModal: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              Protocolo Cuantitativo Obligatorio de Apuestas Deportivas
            </h2>
            <p className="text-sm text-slate-400 mt-1 leading-relaxed">
              El objetivo <strong className="text-slate-200">NO es acertar ganadores</strong> ni predecir resultados por intuición, sino determinar si una cuota ofrecida por la casa contiene <strong className="text-emerald-400">Valor Esperado Positivo (EV+)</strong>. Si no existe margen de ventaja probabilística sobre la casa, la única respuesta profesional es <span className="text-rose-400 font-semibold">«NO APOSTAR»</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Reglas Obligatorias */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <Database className="w-4 h-4" />
            <h3>1. Cero Invención & Fuentes Verificadas</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Ningún dato de xG, alineación, lesión o árbitro puede inventarse. Todo debe provenir de fuentes oficiales o reconocidas (Understat, FBref, SofaScore, FotMob, Transfermarkt, sitios de liga), citadas con enlace y fecha de consulta. Si no se puede verificar, se etiqueta como <span className="font-mono text-amber-300">«No puedo confirmar»</span> y se degrada la confianza.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
            <Shield className="w-4 h-4" />
            <h3>2. Separación DATO vs ESTIMACIÓN</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Se distingue de forma explícita entre <span className="text-emerald-300 font-mono font-medium">[DATO]</span> (hecho verificado con fuente) y <span className="text-indigo-300 font-mono font-medium">[ESTIMACIÓN]</span> (juicio cuantitativo razonado). Se prohíbe taxativamente el lenguaje de certeza («fijo», «seguro», «no falla», «regalo»).
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <AlertCircle className="w-4 h-4" />
            <h3>3. Cuotas de Entrada & 2 Decimales</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Se trabaja únicamente con cuotas reales entregadas por el usuario, exigiendo todas las opciones del mercado y la hora de captura. Todos los cálculos se efectúan a 2 decimales y las probabilidades estimadas deben sumar con rigor exactamente 100.00%.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
            <Scale className="w-4 h-4" />
            <h3>4. Gestión de Riesgo (Anti-Martingala)</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Nunca se sugiere aumentar el stake para recuperar pérdidas. La asignación de capital sigue estrictamente ¼ de Kelly con tope máximo absoluto del 2.00% del bankroll para simples y 1.00% para combinadas. Si EV ≤ 0 o no supera el umbral, stake = 0.00%.
          </p>
        </div>
      </div>

      {/* Fórmulas Matemáticas Cuantitativas */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-emerald-400" />
          Fórmulas Matemáticas del Proceso Cuantitativo
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
          <div className="bg-slate-950 p-3 rounded border border-slate-800/80">
            <div className="text-slate-400 mb-1 font-sans font-medium text-[11px]">1. Margen de la Casa</div>
            <div className="text-emerald-300">S = Σ (1 / cuota)</div>
            <div className="text-emerald-300">Margen = (S − 1) × 100%</div>
            <div className="text-slate-400 mt-1">p_justa = (1 / cuota) / S</div>
          </div>

          <div className="bg-slate-950 p-3 rounded border border-slate-800/80">
            <div className="text-slate-400 mb-1 font-sans font-medium text-[11px]">2. Valor Esperado (EV)</div>
            <div className="text-cyan-300">EV = (p_est × cuota) − 1</div>
            <div className="text-cyan-300">EV% = EV × 100%</div>
            <div className="text-slate-400 mt-1">Cuota mín = 1 / p_est</div>
          </div>

          <div className="bg-slate-950 p-3 rounded border border-slate-800/80">
            <div className="text-slate-400 mb-1 font-sans font-medium text-[11px]">3. Criterio de Kelly (1/4)</div>
            <div className="text-amber-300">f = (p × cuota − 1) / (cuota − 1)</div>
            <div className="text-amber-300">Stake = 0.25 × f</div>
            <div className="text-slate-400 mt-1">Tope máx: 2% Bankroll</div>
          </div>
        </div>
      </div>

      {/* Reglas de Veredicto & Umbrales */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">
          Reglas de Veredicto y Umbrales Mínimos de Seguridad
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Nivel de Confianza</th>
                <th className="py-2.5 px-3">Criterio de Calificación</th>
                <th className="py-2.5 px-3">Umbral Mínimo EV</th>
                <th className="py-2.5 px-3">Veredicto si EV &ge; Umbral</th>
                <th className="py-2.5 px-3">Veredicto si Brecha &le; 10%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              <tr>
                <td className="py-2.5 px-3 font-semibold text-emerald-400">ALTA</td>
                <td className="py-2.5 px-3 text-slate-300">Alineaciones oficiales o muy confirmadas, xG disponible, sin datos críticos faltantes.</td>
                <td className="py-2.5 px-3 font-mono text-emerald-300 font-bold">+3.00%</td>
                <td className="py-2.5 px-3 font-medium text-emerald-400">APOSTAR</td>
                <td className="py-2.5 px-3 text-amber-300">ESPERAR mejor cuota</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-amber-400">MEDIA</td>
                <td className="py-2.5 px-3 text-slate-300">Falta algún dato no crítico o alineación probable sin confirmar al 100%.</td>
                <td className="py-2.5 px-3 font-mono text-amber-300 font-bold">+5.00%</td>
                <td className="py-2.5 px-3 font-medium text-emerald-400">APOSTAR</td>
                <td className="py-2.5 px-3 text-amber-300">ESPERAR mejor cuota</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-rose-400">BAJA</td>
                <td className="py-2.5 px-3 text-slate-300">Faltan alineaciones, xG o bajas, o hay más de un «No puedo confirmar».</td>
                <td className="py-2.5 px-3 font-mono text-rose-400">Inaplicable</td>
                <td className="py-2.5 px-3 font-bold text-rose-400">NUNCA APOSTAR</td>
                <td className="py-2.5 px-3 text-rose-400">NO APOSTAR</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Reglas para Combinadas */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">
          Reglas Estrictas para Apuestas Combinadas (Parlay)
        </h3>
        <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
          <li><strong>Máximo 2 a 3 selecciones:</strong> Por encima de 3, la acumulación exponencial de margen destruye cualquier ventaja cuantitativa.</li>
          <li><strong>Condición previa:</strong> Cada selección debe tener valor esperado positivo por separado y superar su umbral individual.</li>
          <li><strong>Margen acumulado:</strong> Se calcula con la fórmula <code className="bg-slate-950 px-1 py-0.5 rounded text-emerald-300 font-mono">[Π (1 + margen_i)] − 1</code>.</li>
          <li><strong>Prohibición de eventos correlacionados:</strong> Si las selecciones pertenecen al mismo partido o son resultados dependientes, NO se pueden multiplicar probabilidades. Se declara correlación y el veredicto es obligatoriamente NO APOSTAR.</li>
          <li><strong>Stake máximo reducido:</strong> ¼ de Kelly con tope estricto del 1.00% del bankroll.</li>
        </ul>
      </div>

      <div className="p-3 bg-slate-950/70 border border-slate-800 rounded text-center text-xs text-slate-400 italic">
        «Análisis informativo basado en estimaciones; no garantiza resultados.»
      </div>
    </div>
  );
};
