// Modelo de datos de Menarguez Fit IA.
// Todo lo que pertenece a una persona cuelga de ProfileData y se guarda separado por id.

export type Goal = 'hipertrofia' | 'fuerza' | 'salud' | 'composicion' | 'resistencia';
export type Experience = 'ninguna' | 'principiante' | 'intermedio' | 'avanzado';
export type ActivityLevel = 'sedentaria' | 'ligera' | 'moderada' | 'alta';
export type Place = 'casa' | 'gimnasio';
export type Equipment = 'corporal' | 'mancuernas' | 'bandas' | 'maquinas' | 'banco' | 'barra_dominadas';
export type Limitation = 'hombro' | 'codo_muneca' | 'lumbar' | 'cadera' | 'rodilla' | 'tobillo' | 'cervical';
export type Sleep = 'menos6' | '6a7' | '7a9' | 'mas9';
export type Recovery = 'buena' | 'normal' | 'mala';
export type Aerobic = 'caminar' | 'correr' | 'bici' | 'eliptica' | 'nadar' | 'remo';

export type MuscleGroup = 'piernas' | 'pecho' | 'espalda' | 'hombros' | 'brazos' | 'tronco';
export type Pattern =
  | 'sentadilla' | 'bisagra' | 'gluteo' | 'unilateral' | 'pierna_aisl' | 'gemelo'
  | 'empuje_h' | 'empuje_v' | 'traccion_h' | 'traccion_v'
  | 'hombro_aisl' | 'biceps' | 'triceps' | 'tronco';
export type Unit = 'reps' | 'reps_lado' | 'segundos';
export type LoadKind = 'mancuernas' | 'maquina' | 'banda' | 'corporal';

export interface Exercise {
  id: string;
  nombre: string;
  grupo: MuscleGroup;
  patron: Pattern;
  musculos: string[];
  material: Equipment[]; // todo lo necesario
  dificultad: 1 | 2 | 3;
  tipo: 'compuesto' | 'aislamiento' | 'estabilidad';
  unidad: Unit;
  carga: LoadKind;
  evitarSi: Limitation[];
  preparacion: string[];
  ejecucion: string[];
  respiracion: string;
  errores: string[];
  alternativaSencilla?: string;
  alternativasMaterial: string[];
  precauciones: string;
}

export interface Screening {
  sintomasEsfuerzo: boolean; // dolor torácico, mareo, desmayo con el esfuerzo
  restriccionProfesional: boolean; // le han indicado no hacer ejercicio o hacerlo supervisado
  embarazoPosparto: boolean;
  valoradoPorProfesional: boolean; // confirma valoración y puede entrenar
}

export interface Profile {
  id: string;
  demo: boolean;
  nombre: string;
  edad: number;
  objetivo: Goal;
  experiencia: Experience;
  actividad: ActivityLevel;
  dias: number;
  minutos: number;
  limitaciones: Limitation[];
  limitacionesTexto: string;
  dolorQueAumenta: boolean;
  screening: Screening;
  lugar: Place;
  material: Equipment[];
  aerobicoPreferido: Aerobic[];
  evitarEjercicios: string[];
  sueno: Sleep;
  recuperacion: Recovery;
  indicacionesProfesionales: string;
  pesoKg?: number;
  alturaCm?: number;
  creado: string;
  actualizado: string;
}

export interface Prescription {
  series: number;
  repsMin: number;
  repsMax: number;
  rir: number;
  descansoSeg: number;
}

export interface PlannedExercise {
  exerciseId: string;
  presc: Prescription;
  nota?: string;
}

export interface PlannedSession {
  id: string;
  dia: number; // 0 = lunes
  tipo: 'fuerza' | 'aerobica';
  titulo: string;
  objetivo: string;
  minutosEstimados: number;
  calentamiento: string[];
  ejercicios: PlannedExercise[];
  aerobico?: { actividad: Aerobic; minutos: number; intensidad: string };
  vueltaCalma: string[];
  avisos: string[];
}

export interface WeekPlan {
  creado: string;
  version: number;
  sesiones: PlannedSession[];
  diasDescanso: number[];
  sugerenciaDescanso: string;
  notas: string[];
  excluidos: { id: string; motivo: string }[];
}

export interface LoggedSet {
  kg?: number;
  reps?: number;
  segundos?: number;
  hecho: boolean;
}

export interface LoggedExercise {
  exerciseId: string;
  originalId: string;
  presc: Prescription;
  sets: LoggedSet[];
  rpe?: number;
  molestia: 0 | 1 | 2 | 3;
  tecnicaEstable: boolean;
}

export type SessionStatus = 'completada' | 'parcial' | 'cancelada';

export interface SessionLog {
  id: string;
  planSessionId: string;
  titulo: string;
  fecha: string; // ISO
  inicio: string;
  fin: string;
  estado: SessionStatus;
  recuperacion: Recovery;
  ejercicios: LoggedExercise[];
  aerobicoMin?: number;
  rpeSesion?: number;
  nota: string;
}

export interface ActiveSession {
  id: string;
  planSessionId: string;
  titulo: string;
  inicio: string;
  recuperacion: Recovery;
  actual: number;
  ejercicios: LoggedExercise[];
  aerobicoMin?: number;
  timer: { finEn?: number; pausadoRestante?: number; total: number } | null;
}

export interface Measure {
  fecha: string;
  pesoKg?: number;
  cinturaCm?: number;
  caderaCm?: number;
  brazoCm?: number;
}

export interface Decision {
  fecha: string;
  exerciseId: string;
  tipo: 'aceptada' | 'conservada';
  texto: string;
  cargaObjetivo?: number;
}

export interface NutritionProfile {
  objetivo: 'energia_salud' | 'ganar_musculo' | 'perder_grasa' | 'rendimiento';
  comidas: number;
  horarios: string;
  dieta: 'omnivora' | 'vegetariana' | 'vegana' | 'pescetariana';
  rechazados: string;
  alergias: string[];
  presupuesto: 'ajustado' | 'medio' | 'amplio';
  tiempoCocina: 'poco' | 'medio' | 'mucho';
  sexo?: 'mujer' | 'hombre';
  pesoKg?: number;
  alturaCm?: number;
  relacionDificilComida: 'no' | 'si' | 'prefiero_no';
  condicionClinica: boolean;
  embarazoLactancia: boolean;
}

export interface ProfileData {
  profile: Profile;
  plan: WeekPlan | null;
  sesiones: SessionLog[];
  activa: ActiveSession | null;
  favoritos: string[];
  medidas: Measure[];
  decisiones: Decision[];
  ajustes: Record<string, { cargaObjetivo?: number; nota: string; fecha: string }>;
  nutricion: { activa: boolean; perfil: NutritionProfile | null; menu: unknown | null };
}

export interface Draft {
  paso: number;
  respuestas: Partial<Profile>;
}

export interface AppState {
  version: 1;
  activeProfileId: string | null;
  perfiles: Record<string, ProfileData>;
  borrador: Draft | null;
}
