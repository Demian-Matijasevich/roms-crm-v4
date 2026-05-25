# ai-proxy — wrapper de `claude -p` para el CRM

Microservicio Node/Express que recibe POST `/ask` y ejecuta Claude Code headless
(con tu suscripción) en el VPS. La app web (Vercel) lo llama vía
`AI_PROXY_URL` + `AI_PROXY_TOKEN`.

## Deploy en Coolify

1. Crear servicio en Coolify → Application → Public Repository (o Private si subiste el repo).
2. Build context: `ops/ai-proxy/`.
3. Start command: `node server.js`.
4. Variables de entorno:
   - `PORT` = `3007`
   - `PROXY_TOKEN` = un string random largo (ej: `openssl rand -hex 32`)
   - `CLAUDE_BIN` = `/root/.local/bin/claude` (o el path real)
   - Más cualquier env que necesite `claude` (login persistente vía `~/.claude/`).
5. Exponer puerto interno 3007 → asignar subdomain (ej: `ai.backstagge.com`).
6. Probar: `curl https://ai.backstagge.com/health` → `{ok:true}`.

## Variables en Vercel (CRM)

Agregar en project settings:
- `AI_PROXY_URL` = `https://ai.backstagge.com`
- `AI_PROXY_TOKEN` = el mismo string que `PROXY_TOKEN`

Sin estas variables, el endpoint `/api/ai/ask` devuelve 503 y la UI muestra
un mensaje pidiendo configuración.

## Cómo usa el CRM

POST `https://ai.backstagge.com/ask`
```json
{
  "prompt": "Sos asistente del CRM ROMS. Datos: <contexto>. Pregunta: <user>",
  "system": "Respondé en argentino, directo, basándote sólo en los datos.",
  "timeout_ms": 90000
}
```

Respuesta:
```json
{ "answer": "...", "ms": 4823 }
```
