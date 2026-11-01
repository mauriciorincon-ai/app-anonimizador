#!/usr/bin/env bash
# demo-rojo.sh — regla 15 del kit (kit v1.35.0; endurecido en v1.38.0): un gate se demuestra
# FALLANDO, con candado.
#
# Aplica UNA mutación deliberada a un archivo, corre el gate, exige que el gate falle NOMBRANDO lo
# esperado, restaura el archivo desde una ÚNICA carpeta de respaldo y verifica (Python + cmp) que la
# mutación ya no está.
# Origen: ds S5 (K-S5-8/10/11) — una demo «en rojo» que nunca se puso roja, un respaldo guardado en
# otra carpeta que dejó la mutación viva, y un server viejo que seguía sirviendo en el puerto.
# Endurecido en ds S6 (AU-S6-12, K-S6-2/4/5) — un gate que no llegó a correr contaba como rojo, un
# filtro de pruebas que no coincidía salía 0, y un `--buscar` de varias líneas debilitaba el grep.
#
# Uso:
#   scripts/demo-rojo.sh --archivo <ruta> --buscar '<texto exacto>' --reemplazar '<texto>' \
#       --gate '<comando que debe FALLAR>' --debe-nombrar '<texto que el fallo debe decir>' \
#       [--puerto 3000] [--esperar-verde '<comando tras restaurar>'] [--minimo-tests N]
#
# Salida: 0 si el gate falló con la mutación NOMBRANDO lo esperado y volvió a pasar (o no se
#         pidió) tras restaurar; 1 si el gate NO falló (la demo no es demo), si falló sin correr
#         (126/127: comando inexistente) o sin nombrar lo esperado (un servidor que no arrancó,
#         una mutación que no compila: K-S6-5), si el verde corrió menos de N pruebas (un filtro
#         que no coincide con nada sale 0: K-S6-4), si la restauración dejó rastro, o si el puerto
#         sigue ocupado por un proceso viejo. Una interrupción (Ctrl-C, SIGTERM) restaura antes de
#         salir (ds S6, AU-S6-12).
set -u

archivo="" buscar="" reemplazar="" gate="" puerto="" verde="" debe="" minimo=""
while [ $# -gt 0 ]; do
  case "$1" in
    --archivo) archivo="$2"; shift 2;;
    --buscar) buscar="$2"; shift 2;;
    --reemplazar) reemplazar="$2"; shift 2;;
    --gate) gate="$2"; shift 2;;
    --puerto) puerto="$2"; shift 2;;
    --esperar-verde) verde="$2"; shift 2;;
    --debe-nombrar) debe="$2"; shift 2;;
    --minimo-tests) minimo="$2"; shift 2;;
    *) echo "demo-rojo: argumento desconocido $1" >&2; exit 1;;
  esac
done
[ -n "$archivo" ] && [ -n "$buscar" ] && [ -n "$gate" ] || { echo "demo-rojo: faltan --archivo, --buscar o --gate" >&2; exit 1; }
[ -f "$archivo" ] || { echo "demo-rojo: no existe $archivo" >&2; exit 1; }

# Presencia/ausencia de un texto LITERAL (puede tener varias líneas — K-S6-2: `grep -F` trata
# cada línea como un patrón aparte y da verdadero con cualquiera de ellas).
contiene() { python3 -c 'import sys,pathlib; sys.exit(0 if sys.argv[2] in pathlib.Path(sys.argv[1]).read_text() else 1)' "$1" "$2"; }

contiene "$archivo" "$buscar" || { echo "demo-rojo: el texto de --buscar no está en $archivo — la mutación no aplica a nada" >&2; exit 1; }
[ -z "$debe" ] && echo "demo-rojo: ⚠ sin --debe-nombrar, cualquier fallo cuenta como rojo (también uno que no vino de la aserción)" >&2

# UNA sola carpeta de respaldo, nombrada aquí y solo aquí (K-S5-10).
RESPALDO="${DEMO_ROJO_DIR:-.demo-rojo}"
mkdir -p "$RESPALDO"
copia="$RESPALDO/$(echo "$archivo" | tr '/' '_').orig"
cp "$archivo" "$copia"
salida="$RESPALDO/salida.log"

restaurar() {
  cp "$copia" "$archivo"
  if [ -n "$reemplazar" ] && contiene "$archivo" "$reemplazar" && ! contiene "$copia" "$reemplazar"; then
    echo "demo-rojo: ✗ la restauración dejó la mutación en $archivo" >&2; return 1
  fi
  cmp -s "$copia" "$archivo" || { echo "demo-rojo: ✗ $archivo no quedó idéntico al respaldo" >&2; return 1; }
  rm -f "$copia" "$salida"; rmdir "$RESPALDO" 2>/dev/null || true
  return 0
}
# Una interrupción a mitad del gate no deja la mutación viva en el árbol.
trap 'echo "demo-rojo: interrumpido — restaurando $archivo" >&2; restaurar; exit 130' INT TERM

# Cuántas pruebas pasaron según la última línea de resumen (vitest «Tests  N passed»,
# Playwright «N passed»). 0 si no hay resumen.
pasaron() { grep -oE '[0-9]+ passed' "$1" | tail -n 1 | grep -oE '^[0-9]+' || echo 0; }

# Server viejo en el puerto: se mata POR PUERTO, no por nombre de proceso (K-S5-11).
if [ -n "$puerto" ]; then
  # kit v1.40.0 (K-S4-7): SOLO procesos de este repo (su línea de comando contiene $PWD) y del propio usuario;
  # un server ajeno en el puerto se reporta y aborta, jamás se mata.
  pids=""; ajenos=""
  for pid in $(lsof -ti ":$puerto" 2>/dev/null || true); do
    if ps -o command= -p "$pid" 2>/dev/null | grep -qF "$PWD"; then pids="$pids $pid"; else ajenos="$ajenos $pid"; fi
  done
  if [ -n "$ajenos" ]; then echo "demo-rojo: ✗ el puerto $puerto lo ocupa un proceso que NO es de este repo ($ajenos): no se mata; ciérralo tú o usa otro puerto" >&2; restaurar; exit 1; fi
  if [ -n "$pids" ]; then echo "demo-rojo: matando proceso(s) propios en :$puerto →$pids"; kill $pids 2>/dev/null || true; sleep 1; fi
  if lsof -ti ":$puerto" >/dev/null 2>&1; then echo "demo-rojo: ✗ el puerto $puerto sigue ocupado (EADDRINUSE seguro)" >&2; restaurar; exit 1; fi
fi

# Mutación (reemplazo literal, sin regex) con Python para no pelear con sed en macOS/Linux.
python3 - "$archivo" "$buscar" "$reemplazar" <<'PY'
import sys, pathlib
p, a, b = sys.argv[1], sys.argv[2], sys.argv[3]
s = pathlib.Path(p).read_text()
pathlib.Path(p).write_text(s.replace(a, b, 1))
PY

echo "demo-rojo: mutación aplicada en $archivo; corriendo el gate (debe FALLAR)…"
bash -c "$gate" 2>&1 | tee "$salida"; rc=${PIPESTATUS[0]}
if [ "$rc" -eq 0 ]; then
  echo "demo-rojo: ✗ EL GATE PASÓ CON LA MUTACIÓN — no es una demo en rojo (regla 15, tercera pregunta: ¿puede fallar siquiera?)" >&2
  restaurar; exit 1
fi
if [ "$rc" -eq 126 ] || [ "$rc" -eq 127 ]; then
  echo "demo-rojo: ✗ el gate no corrió (exit $rc: comando inexistente o no ejecutable) — eso no es un rojo" >&2
  restaurar; exit 1
fi
if [ -n "$debe" ] && ! grep -qF -- "$debe" "$salida"; then
  echo "demo-rojo: ✗ el gate falló (exit $rc) pero no nombró '$debe' — el rojo no vino de la aserción (K-S6-5)" >&2
  restaurar; exit 1
fi
echo "demo-rojo: ✓ el gate falló con la mutación${debe:+ y nombró '$debe'}"

trap - INT TERM
restaurar || exit 1
echo "demo-rojo: ✓ restaurado y verificado (Python + cmp)"

if [ -n "$verde" ]; then
  echo "demo-rojo: corriendo el gate restaurado (debe PASAR)…"
  mkdir -p "$RESPALDO"
  bash -c "$verde" 2>&1 | tee "$salida"; rc=${PIPESTATUS[0]}
  n=$(pasaron "$salida"); rm -f "$salida"; rmdir "$RESPALDO" 2>/dev/null || true
  [ "$rc" -eq 0 ] || { echo "demo-rojo: ✗ el gate sigue en rojo tras restaurar" >&2; exit 1; }
  if [ -n "$minimo" ] && [ "$n" -lt "$minimo" ]; then
    echo "demo-rojo: ✗ el verde corrió $n prueba(s), menos de --minimo-tests $minimo — un filtro que no coincide sale 0 (K-S6-4)" >&2; exit 1
  fi
  echo "demo-rojo: ✓ verde tras restaurar${minimo:+ ($n pruebas)}"
fi
echo "demo-rojo: registra en la bitácora, DESPUÉS de esta corrida (regla 27): archivo, mutación, a quién nombró el fallo."
