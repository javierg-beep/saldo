/* ════════════════════════════════════════════════════════════════
   Cuentas claras — service worker
   Sube este archivo a la MISMA carpeta que cuentas-claras.html.
   Sirve para dos cosas: que la app abra sin conexión y que se
   instale en el móvil como una aplicación de verdad.

   Cuando cambies el HTML, sube el número de VERSION de aquí abajo.
   Así el navegador tira la copia vieja y se queda con la nueva.
   ════════════════════════════════════════════════════════════════ */

const VERSION = "cuentas-claras-1";
const RECURSOS = [
  "./",
  "./index.html",
  "./cuentas-claras.html"
];

/* Lo que nunca se guarda en caché: los datos tienen que ser frescos
   o no llegar. Supabase siempre va a la red. */
const esDatos = url =>
  url.hostname.endsWith("supabase.co") || url.pathname.includes("/rest/v1/") || url.pathname.includes("/auth/v1/");

/* ---------- instalación: guardamos el esqueleto de la app ---------- */
self.addEventListener("install", evento => {
  evento.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // addAll falla entero si un archivo no existe, así que van de uno en uno
    await Promise.all(RECURSOS.map(r => cache.add(r).catch(() => {})));
    self.skipWaiting();
  })());
});

/* ---------- activación: fuera las cachés de versiones anteriores ---------- */
self.addEventListener("activate", evento => {
  evento.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(n => n !== VERSION).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* ---------- peticiones ---------- */
self.addEventListener("fetch", evento => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;

  const url = new URL(peticion.url);
  if (esDatos(url)) return;                       // Supabase: directo a la red

  /* La página: primero la red, para que veas los cambios en cuanto
     publiques; si no hay conexión, la copia guardada. */
  if (peticion.mode === "navigate"){
    evento.respondWith((async () => {
      try{
        const respuesta = await fetch(peticion);
        const cache = await caches.open(VERSION);
        cache.put(peticion, respuesta.clone());
        return respuesta;
      }catch(e){
        const guardada = await caches.match(peticion) || await caches.match("./") ||
                         await caches.match("./index.html") || await caches.match("./cuentas-claras.html");
        if (guardada) return guardada;
        return new Response(
          "<!doctype html><meta charset='utf-8'><title>Sin conexión</title>" +
          "<body style='font-family:system-ui;background:#0F1115;color:#F3F5F9;display:grid;place-items:center;height:100vh;margin:0;text-align:center'>" +
          "<div><h1 style='font-size:20px'>Sin conexión</h1>" +
          "<p style='color:#98A1B2;font-size:14px'>Abre la app una vez con datos y a partir de ahí funcionará también sin ellos.</p></div>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    })());
    return;
  }

  /* El resto (tipografías, la librería de Supabase): se sirve lo
     guardado al instante y se refresca por detrás para la próxima. */
  evento.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const guardada = await cache.match(peticion);
    const red = fetch(peticion).then(respuesta => {
      if (respuesta && (respuesta.ok || respuesta.type === "opaque")) cache.put(peticion, respuesta.clone());
      return respuesta;
    }).catch(() => null);
    return guardada || await red || Response.error();
  })());
});
