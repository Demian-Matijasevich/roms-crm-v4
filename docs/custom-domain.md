# Custom Domain: crm.lauticardozo.com

## Pasos para configurar el dominio personalizado

### 1. Agregar dominio en Vercel

1. Ir a [Vercel Dashboard](https://vercel.com) → proyecto `lauti-crm`
2. Settings → Domains
3. Agregar: `crm.lauticardozo.com`
4. Vercel va a mostrar los registros DNS necesarios

### 2. Configurar DNS (Cloudflare u otro proveedor)

Agregar un registro **CNAME** en el panel DNS:

| Tipo  | Nombre | Contenido              | Proxy |
|-------|--------|------------------------|-------|
| CNAME | crm    | cname.vercel-dns.com   | DNS only (grey cloud) |

> Si usan Cloudflare con proxy (orange cloud), Vercel igual funciona pero el SSL lo maneja Cloudflare.
> Para dejar que Vercel maneje el SSL, usar "DNS only" (grey cloud).

### 3. Verificacion

- Vercel verifica automaticamente el registro DNS (puede tardar 1-5 minutos)
- Si tarda mas, revisar que el CNAME apunte correctamente

### 4. HTTPS

- Vercel provisiona certificado SSL automaticamente via Let's Encrypt
- No hay que hacer nada extra

### 5. Verificar

Visitar `https://crm.lauticardozo.com` y confirmar que carga el CRM.
