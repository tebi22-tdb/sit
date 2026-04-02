# Que los datos de MongoDB no se borren (VPS bajo tu control)

Si tú administras el VPS 77.37.74.122, haz esto para que los datos de MongoDB **persistan** y no desaparezcan.

---

## 1. Comprobar que los datos están en disco persistente

Conéctate por SSH y ejecuta:

```bash
df -h /var/lib/mongo
```

- Si sale un disco normal (por ejemplo `/dev/vda1` o `/dev/sda1`) → está bien.
- Si sale `tmpfs` o algo tipo "tmpfs" → los datos están en RAM y **se borran al reiniciar**. En ese caso hay que cambiar `dbPath` a un disco real.

Ver también qué tipo de sistema de archivos es:

```bash
mount | grep /var/lib/mongo
```

---

## 2. Confirmar la ruta de datos de MongoDB

```bash
grep dbPath /etc/mongod.conf
```

Debe ser algo como:

```yaml
dbPath: /var/lib/mongo
```

**No** debe ser `/tmp` ni `/run`.

Si estuviera en `/tmp`, edita:

```bash
sudo nano /etc/mongod.conf
```

En la sección `storage:` pon:

```yaml
storage:
  dbPath: /var/lib/mongo
```

Guarda (Ctrl+O, Enter, Ctrl+X).

---

## 3. Asegurar que el directorio existe y tiene permisos

```bash
sudo mkdir -p /var/lib/mongo
sudo chown -R mongod:mongod /var/lib/mongo
sudo chmod 755 /var/lib/mongo
```

(En algunos sistemas el usuario es `mongodb` en lugar de `mongod`; compruébalo con `ps aux | grep mongo`.)

---

## 4. Activar MongoDB al arrancar

Así, tras un reinicio del VPS, MongoDB vuelve a levantar con los mismos datos:

```bash
sudo systemctl enable mongod
sudo systemctl start mongod
sudo systemctl status mongod
```

Debe salir **active (running)**.

---

## 5. Comprobar que el disco no es efímero

En algunos VPS (por ejemplo ciertos planes “burstable” o de prueba), el disco se restaura desde una imagen al reiniciar. Para comprobarlo:

1. Crea un archivo de prueba:  
   `echo "test" | sudo tee /var/lib/mongo/test.txt`
2. Reinicia el VPS:  
   `sudo reboot`
3. Tras volver a conectarte:  
   `cat /var/lib/mongo/test.txt`

- Si el archivo sigue ahí → el disco es persistente.
- Si no existe → el disco es efímero. En ese caso tendrás que:
  - Cambiar a un plan con disco persistente, o
  - Montar un volumen persistente en `/var/lib/mongo` (depende de tu proveedor: DigitalOcean, Linode, etc.).

---

## 6. Backups por si acaso

Aunque todo esté bien, conviene tener copias:

```bash
sudo mkdir -p /opt/sit/backups
```

Backup manual:

```bash
mongodump --uri="mongodb://127.0.0.1:27017/sit_titulacion" --out=/opt/sit/backups/$(date +%Y%m%d-%H%M)
```

Backup automático diario (cron):

```bash
sudo crontab -e
```

Añade:

```
0 3 * * * mongodump --uri="mongodb://127.0.0.1:27017/sit_titulacion" --out=/opt/sit/backups/$(date +\%Y\%m\%d) 2>/dev/null
```

---

## Resumen de comandos (en orden)

```bash
# 1. Comprobar disco
df -h /var/lib/mongo

# 2. Ver dbPath
grep dbPath /etc/mongod.conf

# 3. Directorio y permisos
sudo mkdir -p /var/lib/mongo
sudo chown -R mongod:mongod /var/lib/mongo

# 4. MongoDB al arrancar
sudo systemctl enable mongod
sudo systemctl start mongod
sudo systemctl status mongod
```

Si tras esto los datos siguen desapareciendo, el motivo más probable es que el **disco del VPS sea efímero** (paso 5). En ese caso la solución es cambiar de plan o usar un volumen persistente según tu proveedor.
