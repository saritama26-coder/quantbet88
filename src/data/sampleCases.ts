import { MarketOption, ConfidenceLevel } from '../lib/quantEngine';

export interface SampleCase {
  id: string;
  title: string;
  tagline: string;
  expectedVerdict: 'APOSTAR' | 'NO APOSTAR' | 'ESPERAR';
  match: string;
  competition: string;
  matchDateTime: string; // Hora Guayaquil GMT-5
  market: string;
  captureTime: string;
  bankroll: number;
  confidence: ConfidenceLevel;
  pendingLineups: boolean;
  options: MarketOption[];
  verifiedContext: {
    xgRecent: string;
    homeAwayForm: string;
    injuriesAndLineup: string;
    scheduleAndRest: string;
    competitiveContext: string;
    referee?: string;
    weather?: string;
    unconfirmed: string[];
  };
  risks: string[];
  sources: { title: string; url: string; date: string }[];
  explanation: string;
}

export const SAMPLE_CASES: SampleCase[] = [
  {
    id: 'case-ev-plus',
    title: 'Caso 1: Arsenal vs Chelsea (1X2 Premier League) — EV+ con Confianza ALTA',
    tagline: 'Valor cuantificado en Local tras divergencia de xG y descanso',
    expectedVerdict: 'APOSTAR',
    match: 'Arsenal vs Chelsea',
    competition: 'Premier League (Inglaterra)',
    matchDateTime: '2026-10-04 11:30 (Hora Guayaquil GMT-5)',
    market: '1X2 (Resultado Final)',
    captureTime: '08:15 (GMT-5)',
    bankroll: 1000,
    confidence: 'ALTA',
    pendingLineups: false,
    options: [
      {
        id: 'opt-1',
        name: 'Local (Arsenal)',
        odd: 1.85,
        estimatedProb: 58.50,
        justification: 'Supera xG sostenido de 2.15/partido en Emirates, 6 días de descanso vs 3 de Chelsea que jugó Champions.'
      },
      {
        id: 'opt-2',
        name: 'Empate',
        odd: 3.75,
        estimatedProb: 24.50,
        justification: 'Frecuencia de empates históricos en derbis londinenses ajustada a 24.50%.'
      },
      {
        id: 'opt-3',
        name: 'Visitante (Chelsea)',
        odd: 4.40,
        estimatedProb: 17.00,
        justification: 'Chelsea concede 1.62 xGA de visita en últimos 6 partidos ligueros y viaja con rotación en mediocampo.'
      }
    ],
    verifiedContext: {
      xgRecent: '[DATO] En los últimos 8 partidos, Arsenal promedia 2.18 xG a favor y 0.74 xG en contra. Chelsea promedia 1.45 xG a favor y 1.62 xG en contra (Fuente: Understat).',
      homeAwayForm: '[DATO] Arsenal en casa: 6 victorias, 1 empate, 0 derrotas, diferencial de goles +14. Chelsea fuera: 2 victorias, 2 empates, 3 derrotas (Fuente: FBref).',
      injuriesAndLineup: '[DATO] Alineación probable confirmada al 90%. Arsenal recupera a su pivote titular; Chelsea sin su central diestro por sobrecarga muscular confirmada por el parte médico del club (Fuente: Sitio Oficial del Club / Transfermarkt).',
      scheduleAndRest: '[DATO] Arsenal: 6 días completos de descanso en Londres. Chelsea: 3 días de descanso tras viaje a Múnich (Fuente: Premier League Oficial).',
      competitiveContext: '[DATO] Arsenal disputa el liderato a 1 punto del primer lugar; Chelsea busca puestos de Conference (Fuente: Premier League).',
      referee: '[DATO] Michael Oliver: 3.8 amarillas/partido, 0.18 rojas/partido, 0.22 penales/partido en 14 partidos esta temporada (Fuente: WhoScored / SofaScore).',
      weather: '[DATO] Nublado, 14°C, 15% probabilidad de lluvia ligera, viento 9 km/h (Fuente: MetOffice UK).',
      unconfirmed: []
    },
    risks: [
      'Derbi londinense con alta carga emocional que puede elevar la tasa de tarjetas y alterar el plan táctico.',
      'Efectividad goleadora de Cole Palmer en transiciones rápidas contra bloque alto.',
      'Riesgo residual de rotación imprevista de última hora previa al calentamiento.'
    ],
    sources: [
      { title: 'Understat - Premier League xG Metrics', url: 'https://understat.com/league/EPL', date: '2026-10-03' },
      { title: 'FBref - Arsenal & Chelsea Team Statistics', url: 'https://fbref.com/en/comps/9/Premier-League-Stats', date: '2026-10-03' },
      { title: 'Premier League Official Injuries & Suspensions', url: 'https://www.premierleague.com', date: '2026-10-03' }
    ],
    explanation: 'La cuota de 1.85 implica un 54.05% de probabilidad implícita. Con probabilidad justa desmargenada de 51.52% y una estimación rigurosa de 58.50% sustentada en xG (+1.44 diff) y fatiga rival, el EV resultante es de +8.23%, superando con creces el umbral mínimo del 3.00% con confianza ALTA. Stake ¼ Kelly sugerido: 2.00% (con tope aplicado).'
  },
  {
    id: 'case-no-bet',
    title: 'Caso 2: Real Madrid vs Barcelona (Más/Menos 2.5 Goles) — Margen Alto y EV Negativo',
    tagline: 'Mercado saturado por la casa sin ineficiencia explotable',
    expectedVerdict: 'NO APOSTAR',
    match: 'Real Madrid vs Barcelona',
    competition: 'LaLiga EA Sports (España)',
    matchDateTime: '2026-10-05 14:00 (Hora Guayaquil GMT-5)',
    market: 'Total de Goles Más/Menos 2.5',
    captureTime: '09:00 (GMT-5)',
    bankroll: 1000,
    confidence: 'ALTA',
    pendingLineups: false,
    options: [
      {
        id: 'opt-over',
        name: 'Más de 2.5 Goles',
        odd: 1.55,
        estimatedProb: 61.00,
        justification: 'Generación combinada de xG de 3.80 pero con cuota fuertemente castigada por el público general.'
      },
      {
        id: 'opt-under',
        name: 'Menos de 2.5 Goles',
        odd: 2.45,
        estimatedProb: 39.00,
        justification: 'Tensión táctica de partido directo por el campeonato y porteros en percentil 90 de paradas salvadas.'
      }
    ],
    verifiedContext: {
      xgRecent: '[DATO] Real Madrid promedia 2.10 xG en últimos 10 partidos; Barcelona 2.25 xG (Fuente: Understat). Ambos promedian 1.05 xGA.',
      homeAwayForm: '[DATO] En el Bernabéu, 7 de 9 partidos superaron la línea de 2.5 goles esta temporada (Fuente: SofaScore).',
      injuriesAndLineup: '[DATO] Alineaciones con todos los atacantes titulares disponibles (Mbappé, Vinícius, Lewandowski, Lamine Yamal) (Fuente: LaLiga / Marca).',
      scheduleAndRest: '[DATO] Ambos equipos con 4 días de descanso tras compromisos europeos (Fuente: UEFA).',
      competitiveContext: '[DATO] Enfrentamiento directo entre el 1° y 2° puesto de la tabla (Fuente: LaLiga Oficial).',
      unconfirmed: []
    },
    risks: [
      'Margen excesivo de la casa de apuestas (5.33%) en un mercado binario muy eficiente.',
      'La cuota de 1.55 exige un 64.52% de probabilidad implícita, mientras que el modelo calcula 61.00%.'
    ],
    sources: [
      { title: 'Understat - La Liga xG & Match Log', url: 'https://understat.com/league/La_liga', date: '2026-10-03' },
      { title: 'SofaScore - El Clásico Stats & Trends', url: 'https://www.sofascore.com', date: '2026-10-03' }
    ],
    explanation: 'Para Más de 2.5: EV = (0.61 * 1.55) - 1 = -5.45%. Para Menos de 2.5: EV = (0.39 * 2.45) - 1 = -4.45%. Ambas opciones arrojan valor esperado negativo. La respuesta cuantitativa profesional e innegociable es NO APOSTAR.'
  },
  {
    id: 'case-wait-lineups',
    title: 'Caso 3: Inter de Milán vs Juventus — Cuota Cercana pero Falta Alineación Clave',
    tagline: 'Brecha menor al 10% y estado de Lautaro Martínez en duda',
    expectedVerdict: 'ESPERAR',
    match: 'Inter de Milán vs Juventus',
    competition: 'Serie A (Italia)',
    matchDateTime: '2026-10-04 13:45 (Hora Guayaquil GMT-5)',
    market: '1X2 (Resultado Final)',
    captureTime: '07:30 (GMT-5)',
    bankroll: 1000,
    confidence: 'MEDIA',
    pendingLineups: true,
    options: [
      {
        id: 'opt-int',
        name: 'Local (Inter de Milán)',
        odd: 1.95,
        estimatedProb: 50.00,
        justification: 'Fuerte localía pero pendiente si su delantero estrella juega desde el inicio.'
      },
      {
        id: 'opt-tie',
        name: 'Empate',
        odd: 3.40,
        estimatedProb: 29.00,
        justification: 'Juventus tiene el bloque defensivo con menos goles encajados en Serie A (0.60 por partido).'
      },
      {
        id: 'opt-juv',
        name: 'Visitante (Juventus)',
        odd: 4.10,
        estimatedProb: 21.00,
        justification: 'Poco volumen de tiros a puerta de visita (3.2 por partido).'
      }
    ],
    verifiedContext: {
      xgRecent: '[DATO] Inter xG últimos 6: 1.88 favor / 0.92 contra. Juventus xG últimos 6: 1.25 favor / 0.68 contra (Fuente: Understat).',
      homeAwayForm: '[DATO] Inter invicto en San Siro con 5 victorias y 1 empate (Fuente: FBref).',
      injuriesAndLineup: '[DATO] Lautaro Martínez sufrió golpe en el tobillo en el último entrenamiento. [No puedo confirmar] si iniciará como titular o esperará en el banquillo. Se confirmará 60 minutos antes (Fuente: Gazzetta dello Sport / Inter Oficial).',
      scheduleAndRest: '[DATO] Inter jugó el martes (5 días descanso); Juventus jugó el miércoles (4 días descanso) (Fuente: Lega Serie A).',
      competitiveContext: '[DATO] Derby d\'Italia por el liderato de la Serie A.',
      unconfirmed: ['Titularidad confirmada del capitán y máximo goleador del Inter de Milán.']
    },
    risks: [
      'Si Lautaro no inicia, el xG generado proyectado del Inter desciende un 22%.',
      'La cuota mínima calculada para Inter es 2.00 (1 / 0.50), mientras que la cuota actual es 1.95 (brecha de 2.56%, inferior al 10%).'
    ],
    sources: [
      { title: 'Lega Serie A Official Site', url: 'https://www.legaseriea.it', date: '2026-10-03' },
      { title: 'Understat - Serie A Advanced xG', url: 'https://understat.com/league/Serie_A', date: '2026-10-03' }
    ],
    explanation: 'EV actual para Inter: (0.50 * 1.95) - 1 = -2.50%. No obstante, la cuota mínima aceptable es 2.00, que dista solo un 2.56% de la cuota disponible (1.95), y la alineación oficial se publicará en breve. De acuerdo con la Regla 3, el veredicto es ESPERAR mejor cuota o confirmación oficial de alineaciones.'
  }
];
