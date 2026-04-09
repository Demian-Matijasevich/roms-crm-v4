# Lauti CRM — n8n Integration Flows

> These flows are configured manually in n8n. This document serves as the
> specification for each flow.

---

## Flow 1: Calendly → Supabase

**Trigger:** Webhook node (Calendly sends POST on event creation/cancellation)

**Calendly webhook URL:** `https://n8n.yourdomain.com/webhook/calendly-lauti`

### Steps:

1. **Webhook Node** — receives Calendly payload
   - Event types: `invitee.created`, `invitee.canceled`
   - Extract: `event_type`, `payload.name`, `payload.email`,
     `payload.questions_and_answers`, `payload.scheduled_event.name`,
     `payload.scheduled_event.uri`, `payload.scheduled_event.start_time`

2. **Switch Node** — route by event type
   - `invitee.created` → Step 3
   - `invitee.canceled` → Step 6

3. **Assign Setter/Closer** — Function node
   ```javascript
   // Map Calendly calendar name to team member
   const calendarName = $input.item.json.payload.scheduled_event.name;

   const calendarMap = {
     "Calendario 1": { setter_id: "UUID_JOAQUIN", closer_id: "UUID_IVAN" },
     "Calendario 2": { setter_id: "UUID_JORGE", closer_id: "UUID_IVAN" },
     "Consultoria": { setter_id: null, closer_id: "UUID_LAUTI" },
     // Add more calendars as needed
   };

   const assignment = calendarMap[calendarName] || {
     setter_id: null,
     closer_id: null,
   };

   return { ...assignment, calendarName };
   ```

4. **Check if 1a1 session** — IF node
   - Condition: calendar name contains "1a1" or "seguimiento"
   - YES → Step 5 (create tracker_sessions record)
   - NO → Step 4a (create/update leads record)

4a. **Insert Lead** — Supabase node (Insert into `leads`)
   ```json
   {
     "nombre": "{{ $json.payload.name }}",
     "email": "{{ $json.payload.email }}",
     "evento_calendly": "{{ $json.payload.scheduled_event.name }}",
     "calendly_event_id": "{{ $json.payload.scheduled_event.uri.split('/').pop() }}",
     "fecha_agendado": "{{ $now.toISO() }}",
     "fecha_llamada": "{{ $json.payload.scheduled_event.start_time }}",
     "estado": "pendiente",
     "setter_id": "{{ $json.setter_id }}",
     "closer_id": "{{ $json.closer_id }}",
     "utm_source": "{{ extractFromAnswers('utm_source') }}",
     "utm_medium": "{{ extractFromAnswers('utm_medium') }}",
     "utm_content": "{{ extractFromAnswers('utm_content') }}"
   }
   ```
   - Extract UTM values from Calendly hidden fields or `questions_and_answers`

4b. **Send Push Notification** — HTTP Request node
   ```
   POST https://lauti-crm.vercel.app/api/notifications/send
   Authorization: Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}
   Body:
   {
     "event": "agenda_calendly",
     "title": "Nueva agenda Calendly",
     "body": "{{ $json.payload.name }} agendo para {{ formatDate(startTime) }}",
     "recipientIds": ["{{ $json.closer_id }}"]
   }
   ```

5. **Insert Tracker Session** — Supabase node (Insert into `tracker_sessions`)
   ```json
   {
     "client_id": "{{ lookup client by email }}",
     "fecha": "{{ $json.payload.scheduled_event.start_time }}",
     "estado": "programada",
     "enlace_llamada": "{{ $json.payload.scheduled_event.location.join_url }}",
     "assignee_id": "{{ $json.closer_id }}"
   }
   ```

6. **Handle Cancellation** — Supabase node (Update `leads`)
   - Find lead by `calendly_event_id`
   - Set `estado = 'cancelada'`

---

## Flow 2: Daily Task Generator (Cron)

**Trigger:** Cron — every day at 08:00 AM (America/Argentina/Buenos_Aires)

### Steps:

1. **Cron Node** — `0 8 * * *`

2. **HTTP Request** — Call task generation endpoint
   ```
   POST https://lauti-crm.vercel.app/api/agent-tasks/generate
   Authorization: Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}
   ```

3. **Log Results** — Function node
   - Log how many tasks were generated
   - If errors, send alert to Mel via WhatsApp or push notification

### Task generation logic (inside the API route):

| Condition | Task Type | Priority |
|-----------|-----------|----------|
| Payment `fecha_vencimiento` = today + 3 days AND `estado` = 'pendiente' | `cobrar_cuota` | 3 (media) |
| Payment `fecha_vencimiento` < today AND `estado` = 'pendiente' | `cobrar_cuota` | 1 (alta) |
| Client `fecha_offboarding` = today + 15 days | `renovacion` | 3 (media) |
| Client `fecha_offboarding` < today | `renovacion` | 1 (alta) |
| Client last follow-up > 7 days ago | `seguimiento` | 3 (media) |
| Client `llamadas_disponibles` = 0 | `oportunidad_upsell` | 4 (normal) |
| Lead `estado` = 'cerrado' AND no bienvenida task exists | `bienvenida` | 1 (alta) |
| Tracker session `rating` <= 5 | `seguimiento_urgente` | 1 (alta) |
| Payment `estado` changed to 'pagado' AND no confirmar_pago task | `confirmar_pago` | 4 (normal) |
| Client `health_score` < 50 | `seguimiento_urgente` | 1 (alta) |

**De-duplication:** Before creating, check `agent_tasks` for existing active task (estado IN ('pending', 'in_progress')) with same `client_id` + `tipo`.

---

## Flow 3: Agent Execution (Cron)

**Trigger:** Cron — every 30 minutes, 08:00-22:00 (America/Argentina/Buenos_Aires)

### Steps:

1. **Cron Node** — `*/30 8-22 * * *`

2. **Fetch Pending Tasks** — Supabase node
   ```sql
   SELECT * FROM agent_tasks
   WHERE estado = 'pending'
     AND asignado_a = 'agent'
     AND scheduled_at <= NOW()
   ORDER BY prioridad ASC, created_at ASC
   LIMIT 10
   ```

3. **Loop** — For each task:

   3a. **Set In Progress** — Update `agent_tasks` set `estado = 'in_progress'`

   3b. **Build Message** — Function node
   - Read `contexto` JSON from task
   - Select message template based on `tipo`:
     - `cobrar_cuota`: "Hola [nombre], te recordamos que tenes una cuota pendiente de $[monto] USD..."
     - `renovacion`: "Hola [nombre], tu programa esta por vencer. Queremos contarte sobre las opciones..."
     - `bienvenida`: "Bienvenido/a [nombre]! Soy del equipo de Lauti. Te comparto los accesos..."
     - `seguimiento`: "Hola [nombre], como estas? Queriamos saber como vas con..."
     - `confirmar_pago`: "Hola [nombre], confirmamos la recepcion de tu pago de $[monto] USD..."

   3c. **Send WhatsApp** — HTTP Request to Evolution API / WA Business API
   ```
   POST {{ $env.EVOLUTION_API_URL }}/message/sendText/{{ $env.WA_INSTANCE }}
   Headers: apikey: {{ $env.EVOLUTION_API_KEY }}
   Body:
   {
     "number": "{{ phone }}",
     "text": "{{ message }}"
   }
   ```

   3d. **Log Action** — Supabase Insert into `agent_log`
   ```json
   {
     "task_id": "{{ task.id }}",
     "accion": "whatsapp_sent",
     "mensaje_enviado": "{{ message }}",
     "resultado": "sent"
   }
   ```

   3e. **Update Task** — Supabase Update `agent_tasks`
   ```json
   {
     "estado": "done",
     "completed_at": "{{ $now.toISO() }}",
     "resultado": "Message sent via WhatsApp"
   }
   ```

   3f. **Error Handling** — If send fails:
   - Set `estado = 'failed'`
   - Log error in `agent_log`
   - Continue to next task

---

## Flow 4: Notification Dispatcher

**Trigger:** Supabase Database Webhook (via Supabase Dashboard > Database > Webhooks)

### Webhooks to configure in Supabase:

| Table | Event | Webhook URL |
|-------|-------|-------------|
| `leads` | INSERT where estado='cerrado' | `https://n8n.yourdomain.com/webhook/lauti-sale` |
| `payments` | UPDATE where estado='pagado' | `https://n8n.yourdomain.com/webhook/lauti-payment` |
| `tracker_sessions` | INSERT | `https://n8n.yourdomain.com/webhook/lauti-session` |
| `agent_tasks` | UPDATE where estado='done' | `https://n8n.yourdomain.com/webhook/lauti-agent-done` |

### Sub-flow: Sale Notification

1. **Webhook** receives lead INSERT
2. **Enrich** — Fetch closer name from team_members
3. **Send Push** — HTTP Request to `/api/notifications/send`
   ```json
   {
     "event": "venta_nueva",
     "title": "Venta nueva!",
     "body": "[Closer] cerro a [Nombre] — [Programa] — $[Ticket] USD",
     "url": "/pipeline"
   }
   ```

### Sub-flow: Payment Notification

1. **Webhook** receives payment UPDATE
2. **Send Push** to admin roles
   ```json
   {
     "event": "pago_cuota",
     "title": "Pago recibido",
     "body": "Cuota [N] de [Nombre] — $[Monto] USD",
     "url": "/tesoreria"
   }
   ```

### Sub-flow: Session Consumption Alert

1. After tracker_session INSERT, check client's remaining sessions
2. If `llamadas_disponibles` = 0:
   ```json
   {
     "event": "consumio_1a1",
     "title": "Sesiones agotadas",
     "body": "[Nombre] consumio todas sus sesiones 1a1",
     "recipientIds": ["UUID_LAUTI"]
   }
   ```

### Sub-flow: Agent Task Completed

1. **Webhook** receives agent_task UPDATE to 'done'
2. **Send Push** to Mel only (filter by `can_see_agent = true`)
   ```json
   {
     "event": "agente_completo",
     "title": "Agente completo tarea",
     "body": "[Tipo]: [Client] — [Resultado]",
     "recipientIds": ["UUID_MEL"]
   }
   ```

### Sub-flow: Cuota Vencida Alert

- Triggered by the daily task generator (Flow 2)
- When a `cobrar_cuota` task with priority 1 (alta) is created:
   ```json
   {
     "event": "cuota_vencida",
     "title": "Cuota vencida",
     "body": "[Nombre] tiene cuota vencida de $[Monto] USD",
     "recipientIds": ["UUID_MEL"]
   }
   ```

### Sub-flow: Health Score Red Alert

- Triggered when `v_client_health` refresh detects score drop below 50
- Runs as part of the daily task generator
   ```json
   {
     "event": "score_rojo",
     "title": "Score en rojo",
     "body": "[Nombre] cayo a score [X] — requiere atencion",
     "recipientIds": ["UUID_PEPITO"]
   }
   ```

---

## Environment Variables (n8n)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For authenticated API calls |
| `EVOLUTION_API_URL` | Evolution API base URL |
| `EVOLUTION_API_KEY` | Evolution API key |
| `WA_INSTANCE` | WhatsApp instance name |
| `CRM_BASE_URL` | `https://lauti-crm.vercel.app` |

---

## Setup Checklist

- [ ] Configure Calendly webhook pointing to n8n
- [ ] Create Supabase Database Webhooks for each table/event
- [ ] Set up Evolution API instance for WhatsApp
- [ ] Add all environment variables to n8n
- [ ] Map team member UUIDs in the calendar assignment function
- [ ] Test each flow end-to-end with real data
- [ ] Monitor agent_log for errors in the first week
