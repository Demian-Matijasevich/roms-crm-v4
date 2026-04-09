import { z } from "zod";

export const igMetricsSchema = z.object({
  periodo: z.string().min(1, "Periodo requerido"),
  fecha_inicio: z.string().min(1, "Fecha inicio requerida"),
  fecha_fin: z.string().min(1, "Fecha fin requerida"),
  // Alcance
  cuentas_alcanzadas: z.number().int().min(0).default(0),
  delta_alcance_pct: z.number().default(0),
  impresiones: z.number().int().min(0).default(0),
  delta_impresiones_pct: z.number().default(0),
  visitas_perfil: z.number().int().min(0).default(0),
  delta_visitas_pct: z.number().default(0),
  toques_enlaces: z.number().int().min(0).default(0),
  delta_enlaces_pct: z.number().default(0),
  pct_alcance_no_seguidores: z.number().min(0).max(100).default(0),
  // Seguidores
  nuevos_seguidores: z.number().int().min(0).default(0),
  delta_seguidores_pct: z.number().default(0),
  unfollows: z.number().int().min(0).default(0),
  total_seguidores: z.number().int().min(0).default(0),
  // Interacciones generales
  total_interacciones: z.number().int().min(0).default(0),
  delta_interacciones_pct: z.number().default(0),
  cuentas_interaccion: z.number().int().min(0).default(0),
  pct_interaccion_no_seguidores: z.number().min(0).max(100).default(0),
  // Reels
  reels_publicados: z.number().int().min(0).default(0),
  interacciones_reels: z.number().int().min(0).default(0),
  delta_reels_pct: z.number().default(0),
  likes_reels: z.number().int().min(0).default(0),
  comentarios_reels: z.number().int().min(0).default(0),
  compartidos_reels: z.number().int().min(0).default(0),
  guardados_reels: z.number().int().min(0).default(0),
  // Posts
  posts_publicados: z.number().int().min(0).default(0),
  interacciones_posts: z.number().int().min(0).default(0),
  delta_posts_pct: z.number().default(0),
  likes_posts: z.number().int().min(0).default(0),
  comentarios_posts: z.number().int().min(0).default(0),
  compartidos_posts: z.number().int().min(0).default(0),
  guardados_posts: z.number().int().min(0).default(0),
  // Stories
  stories_publicadas: z.number().int().min(0).default(0),
  interacciones_stories: z.number().int().min(0).default(0),
  delta_stories_pct: z.number().default(0),
  respuestas_stories: z.number().int().min(0).default(0),
  // DMs
  conversaciones_dm: z.number().int().min(0).default(0),
  // Demograficos
  pct_hombres: z.number().min(0).max(100).default(0),
  pct_mujeres: z.number().min(0).max(100).default(0),
  top_paises: z.string().optional().default(""),
  top_ciudades: z.string().optional().default(""),
  top_edades: z.string().optional().default(""),
  // Business
  leads_ig: z.number().int().min(0).default(0),
  ventas_ig: z.number().int().min(0).default(0),
  cash_ig: z.number().min(0).default(0),
});

export type IgMetricsFormData = z.infer<typeof igMetricsSchema>;
