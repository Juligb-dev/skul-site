# Backups de Firestore (y cómo volver atrás)

Este doc explica cómo respaldar la base de la tienda y cómo restaurarla si algo
se borra. Está escrito para leerse **en el momento**, así que va de lo más
urgente a lo más detallado.

## Lo primero: ¿qué pasa si se borra algo?

- **Si borraste algo desde `/admin` hace minutos**: no hay "deshacer". Firestore
  no guarda papelera y el plan gratis no tiene recuperación a un punto en el
  tiempo. Se recupera **desde el último backup**.
- **Si el problema es la web y no los datos**: no toques el backup. Volvé a
  deployar (`npm run build && npx firebase deploy --only hosting`).
- **Si el problema son las reglas**: viven en `firestore.rules`, versionadas en
  git. Ahí sí hay historial: `git log -p firestore.rules`.

## Correr un backup

```bash
npm run backup
```

Baja **todas** las colecciones a `backups/firestore-<fecha-hora>/`, un archivo
JSON por colección, más un `manifest.json` con el resumen:

```
backups/firestore-20261016-2130/
├── products.json
├── orders.json
├── giftCards.json
├── coupons.json
├── newsletter.json
├── arrepentimientos.json
├── settings.json          (ajustes del sitio)
├── orderTracking.json
└── manifest.json          ← cuántos documentos hay en cada una
```

Antes de correrlo, **la clave de servicio** tiene que estar en su lugar (abajo).

> ⚠️ **`backups/` está en `.gitignore` y tiene que seguir estando.** Ahí adentro
> hay nombre, teléfono y dirección de clientes. Un backup **nunca** se sube a
> GitHub, ni se manda por WhatsApp, ni se guarda en una carpeta compartida.

## Configurar la clave (una sola vez)

El script corre con una **clave de servicio** de Firebase, que se baja desde la
consola:

1. Entrá a [console.firebase.google.com](https://console.firebase.google.com),
   elegí el proyecto **SKUL WEB** (`skullt`).
2. Arriba a la izquierda, ⚙️ **Configuración del proyecto** → pestaña
   **Cuentas de servicio**.
3. Botón **Generar nueva clave privada** → **Generar clave**. Se baja un `.json`
   (algo como `skullt-xxxxxxxx.json`).
4. Guardalo **fuera de este repo**, con este nombre exacto:

   ```bash
   mv ~/Downloads/skullt-*.json ~/.skul-backup-key.json
   chmod 600 ~/.skul-backup-key.json
   ```

5. Probá:

   ```bash
   npm run backup
   ```

Si preferís tenerla en otro lado, pasá la ruta con `--key <ruta>` o exportá
`GOOGLE_APPLICATION_CREDENTIALS` (la convención de Google).

> La clave tiene permiso **total** sobre la base (es la misma cuenta de servicio
> con la que el Worker lee y escribe). No la pegues en un chat ni en un archivo
> del repo. Si alguna vez se te escapa, se revoca y se genera otra en el mismo
> lugar de la consola, sin afectar la que usa el Worker en producción.

## Restaurar

La restauración **escribe documento por documento** (no borra nada): los
documentos que están en el backup se pisan con el contenido respaldado, y los
que no están en el backup quedan como están.

```bash
# 1) Ver QUÉ haría, sin escribir nada:
node scripts/backup-firestore.mjs --restore backups/firestore-20261016-2130 --dry-run

# 2) Restaurar de verdad (el --confirmar es obligatorio contra la base real):
node scripts/backup-firestore.mjs --restore backups/firestore-20261016-2130 --confirmar
```

El `--confirmar` existe a propósito: evita que un comando mal tipeado reescriba
la base de producción. En el emulador no hace falta.

### Casos típicos

| Qué pasó | Qué restaurar |
|---|---|
| Borré productos sin querer | La carpeta del día anterior (solo toca `products`) |
| Un pedido quedó mal | La carpeta más vieja que tenga ese pedido |
| Se rompió todo (base mezclada) | La carpeta completa más reciente |

Un backup es **una foto completa**: si restaurás una carpeta vieja, los pedidos
nuevos que no están en esa foto **no se borran** (la restauración nunca borra),
pero los productos vuelven al estado de esa foto. Por eso conviene respaldar
**antes** de hacer cambios grandes (una limpieza de catálogo, un cambio de
precios masivo).

## Automatizarlo (gratis, en tu Mac)

Google solo da backups automáticos en el plan pago, así que si querés que corra
solo todos los días, se programa **en tu computadora**:

```bash
# Crear el archivo de programación diaria (a las 21:00) — macOS
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.skul.backup.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.skul.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd "$HOME/LOCAL SKUL/WEB LOCAL/skul-site-final" && /usr/local/bin/npm run backup</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>21</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/tmp/skul-backup.log</string>
  <key>StandardErrorPath</key><string>/tmp/skul-backup.log</string>
</dict>
</plist>
PLIST

launchctl load ~/Library/LaunchAgents/com.skul.backup.plist
```

Ajustá la ruta del proyecto y la de `npm` (en este equipo: `/usr/local/bin/npm`)
si son distintas. Para probarlo sin esperar:

```bash
launchctl start com.skul.backup && sleep 5 && tail -20 /tmp/skul-backup.log
```

Para desactivarlo: `launchctl unload ~/Library/LaunchAgents/com.skul.backup.plist`.

Si la Mac está apagada a esa hora, el backup **no corre** (no se recupera
después). Si querés que no dependa de tener la Mac prendida, la alternativa real
es pasar el proyecto al plan pago de Firebase y usar los backups de Google:

```bash
npx firebase firestore:backups:schedules:create --project skullt --recurrence DAILY --retention 14d
```

## Cómo está hecho (para el que lo tenga que tocar)

`scripts/backup-firestore.mjs` habla directo con la API REST de Firestore, sin
dependencias nuevas:

1. Firma un JWT con la clave de servicio (`node:crypto`, RS256) y lo canjea por
   un token de acceso en el endpoint de OAuth de Google.
2. Lista las colecciones (`:listCollectionIds`) y pagina los documentos de cada
   una **de a 300** (el máximo de la API; sin paginar se perderían documentos y
   el backup parecería exitoso).
3. Traduce cada valor del formato de Firestore a JSON común y viceversa. Lo que
   no existe en JSON (timestamp, referencia, geopunto, bytes) viaja marcado con
   `__tipo`, así la restauración queda exacta.
4. Escribe con `PATCH` (upsert) al restaurar.

Sus pruebas están en `scripts/test-backup.mjs` y corren **solo contra el
emulador** (`npm run test:backup`): siembran documentos con todos los tipos,
incluida una colección de 320 documentos para probar la paginación, borran todo,
restauran y comparan que la base haya quedado igual.
