import os
import re

# Ruta de la carpeta
carpeta = r"C:\Users\adjms\OneDrive\Escritorio\Nueva carpeta (3)\Tienda de caro\Caro-Sweet-Mua-main\img\Cabello"

# Prefijo
prefijo = "Cabello-"

# Extensiones permitidas
extensiones = (
    ".jpg", ".jpeg", ".png", ".webp", ".gif",
    ".mp4"
)

# Obtener todos los archivos
todos = os.listdir(carpeta)

# Buscar el número más alto ya existente
ultimo_numero = 0

for archivo in todos:
    patron = rf"{re.escape(prefijo)}(\d+)"
    resultado = re.match(patron, os.path.splitext(archivo)[0])

    if resultado:
        numero = int(resultado.group(1))
        if numero > ultimo_numero:
            ultimo_numero = numero

# Obtener SOLO archivos que aún no tienen el prefijo
archivos_nuevos = [
    f for f in todos
    if f.lower().endswith(extensiones)
    and not f.startswith(prefijo)
]

# Ordenar
archivos_nuevos.sort()

# Empezar desde el siguiente número
contador = ultimo_numero + 1

# Renombrar
for archivo in archivos_nuevos:
    extension = os.path.splitext(archivo)[1]

    nuevo_nombre = f"{prefijo}{contador}{extension}"

    ruta_vieja = os.path.join(carpeta, archivo)
    ruta_nueva = os.path.join(carpeta, nuevo_nombre)

    os.rename(ruta_vieja, ruta_nueva)

    print(f"{archivo} -> {nuevo_nombre}")

    contador += 1

print("Renombrado completado.")