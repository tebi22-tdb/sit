# Despliegue SITVO — Paso a paso

Sigue los pasos en orden. Todo se hace en dos sitios: **tu PC** y **el servidor** (77.37.74.122).

---

# PARTE 1: En tu computadora (Windows)

## Paso 1.1 — Abrir PowerShell en la raíz del proyecto

Abre PowerShell y ve a la carpeta del proyecto:

```powershell
cd C:\Users\esteb\IdeaProjects\sit
```

---

## Paso 1.2 — Compilar el backend

Ejecuta:

```powershell
.\gradlew bootJar
```

Espera a que termine. Si todo va bien, se crea el archivo:  
`build\libs\sit-0.0.1-SNAPSHOT.jar`

---

## Paso 1.3 — Compilar el frontend

Ejecuta:

```powershell
cd frontend
npm install
npm run build
cd ..
```

Espera a que termine. Los archivos quedan en:  
`frontend\dist\sit-frontend\browser\`

---

## Paso 1.4 — Crear carpetas en el servidor

Ejecuta (sustituye `root` por tu usuario si no usas root):

```powershell
ssh root@77.37.74.122 "mkdir -p /opt/sit /var/www/sit"
```

Te pedirá la contraseña del servidor.

---

## Paso 1.5 — Subir el JAR del backend

Desde la raíz del proyecto (C:\Users\esteb\IdeaProjects\sit):

```powershell
scp build/libs/sit-0.0.1-SNAPSHOT.jar root@77.37.74.122:/opt/sit/
```

---

## Paso 1.6 — Subir el frontend

En Windows, entra en la carpeta del build y sube todo su contenido:

```powershell
cd frontend\dist\sit-frontend\browser
scp -r . root@77.37.74.122:/var/www/sit/
cd ..\..\..\..
```

(O desde la raíz del proyecto en una sola línea:  
`cd frontend\dist\sit-frontend\browser; scp -r . root@77.37.74.122:/var/www/sit/`  
y luego vuelve con `cd C:\Users\esteb\IdeaProjects\sit`.)

---

# PARTE 2: En el servidor (por SSH)

## Paso 2.1 — Conectarte al servidor

En PowerShell:

```powershell
ssh root@77.37.74.122
```

Ya estás dentro del servidor. Los siguientes comandos se ejecutan ahí.

---

## Paso 2.2 — Comprobar Java 21

Ejecuta:

```bash
java -version
```

Si no tienes Java 21, instálalo:

```bash
sudo dnf install -y java-21-openjdk
```

o, si usas yum:

```bash
sudo yum install -y java-21-openjdk
```

---

## Paso 2.3 — Crear el servicio del backend

Ejecuta:

```bash
sudo nano /etc/systemd/system/sit.service
```

Se abre el editor. **Borra** todo lo que haya y **pega** exactamente esto:

```ini
[Unit]
Description=SITVO Backend
After=network.target mongod.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sit
ExecStart=/usr/bin/java -jar /opt/sit/sit-0.0.1-SNAPSHOT.jar
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Guarda y sal: **Ctrl+O**, Enter, luego **Ctrl+X**.

---

## Paso 2.4 — Activar e iniciar el servicio

Ejecuta uno por uno:

```bash
sudo systemctl daemon-reload
sudo systemctl enable sit
sudo systemctl start sit
sudo systemctl status sit
```

En `status` deberías ver **active (running)** en verde. Para salir de status: tecla **q**.

---

## Paso 2.5 — Crear la configuración de Nginx

Ejecuta:

```bash
sudo nano /etc/nginx/conf.d/sit.conf
```

Borra todo y pega exactamente esto:

```nginx
server {
    listen 80;
    server_name 77.37.74.122;

    root /var/www/sit;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8081/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Guarda y sal: **Ctrl+O**, Enter, **Ctrl+X**.

---

## Paso 2.6 — Comprobar y reiniciar Nginx

```bash
sudo nginx -t
```

Tiene que decir **syntax is ok**. Luego:

```bash
sudo systemctl restart nginx
```

---

## Paso 2.7 — Abrir el puerto 80 (firewall)

Si tu servidor usa firewall:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

Si no usas firewall, puedes saltarte este paso.

---

## Paso 2.8 — Salir del servidor

```bash
exit
```

---

# PARTE 3: Probar

## Paso 3.1 — Abrir en el navegador

En tu PC abre el navegador y entra a:

**http://77.37.74.122**

Deberías ver primero la pantalla de **login**. Tras iniciar sesión como coordinador verás la aplicación SITVO (lista de egresados, botón Nuevo, etc.).

---

## Paso 3.2 — Compartir con tu profesor

Envía a tu profesor esta URL: **http://77.37.74.122**

---

# Si algo falla

- **No carga la página:** revisa el firewall (Paso 2.7) y que Nginx esté corriendo:  
  `sudo systemctl status nginx`
- **Carga la página pero no hay datos:** revisa el backend:  
  `sudo systemctl status sit`  
  Ver logs:  
  `journalctl -u sit -f`
- **Seguimiento dice "No tienes un registro de seguimiento asociado" (404):**  
  El backend no encuentra un egresado para ese usuario. Ver logs:  
  `journalctl -u sit -n 100`  
  Busca líneas `mi-seguimiento: username=...`; indican si faltó por **egresadoId** o por **numero_control**.  
  Comprueba en la misma base a la que se conecta el backend (p. ej. `sit_titulacion`):  
  - Colección **registro**: debe existir un documento con `numero_control` igual al username del egresado (ej. `vdhvd`).  
  - Colección **usuarios**: el usuario puede tener `egresadoId` (ObjectId del egresado) o no; si no, el backend busca por numero_control.  
  Si el egresado se creó desde la app en ese servidor, el usuario queda vinculado y la siguiente vez debería cargar.
- **Error de Nginx:**  
  `sudo nginx -t`  
  y  
  `tail -20 /var/log/nginx/error.log`
