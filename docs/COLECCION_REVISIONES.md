# Colección `revisiones`

**Base de datos:** `sit_titulacion` (misma que `registro` y `usuarios`).  
**Colección:** `revisiones`.

Cada vez que el departamento académico hace una revisión se **crea un documento nuevo**. No se sustituye el anterior: si primero hubo `resultado: "observaciones"` y luego se aprueba, se inserta otro documento con `resultado: "aprobado"` y `numero_revision` mayor. Así se conserva todo el historial.

---

## Así queda la estructura

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `_id` | ObjectId | Sí (MongoDB) | Id del documento. |
| `egresado_id` | ObjectId | Sí | Referencia al egresado en la colección `registro`. |
| `numero_revision` | Int | Sí | Número de la revisión para ese egresado (1, 2, 3…). |
| `fecha` | Date (ISODate) | Sí | Fecha y hora de la revisión. |
| `revisado_por` | String | Sí | Usuario que revisa (ej. `"academico"`). |
| `resultado` | String | Sí | `"observaciones"` o `"aprobado"`. |
| `observaciones` | String | No | Texto de observaciones cuando `resultado = "observaciones"`. |
| `detalle_observaciones` | Array | No | Lista por documento/sección (opcional). |
| `fecha_envio_siguiente` | Date (ISODate) | No | Cuando `resultado = "aprobado"`, fecha de envío al siguiente departamento. |

**Índice recomendado:** `{ "egresado_id": 1, "fecha": -1 }` para consultar por egresado y ordenar por fecha.

---

## Flujo

1. **Coordinador** envía la solicitud al departamento académico (se registra `fecha_enviado_departamento_academico` en el egresado).
2. **Departamento académico** recibe, revisa y puede:
   - Dejar **observaciones** y regresar la solicitud al egresado (**En corrección**).
   - **Aprobar** y enviar al siguiente departamento (Registro y liberación).
3. El egresado corrige y vuelve a enviar; el departamento académico puede revisar de nuevo. El ciclo se repite hasta que se apruebe.
4. Al aprobar, el expediente pasa al departamento de **Registro y liberación**, que en su momento lo regresará al **Departamento de estudios profesionales**.

Cada vez que el académico hace una revisión (con observaciones o aprobación), se crea un documento en `revisiones` para tener trazabilidad completa.

---

## Campos propuestos para cada documento

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `egresado_id` | ObjectId | Referencia al documento en la colección `registro` (el egresado/solicitud revisado). |
| `numero_revision` | Int | Número de esta revisión para ese egresado (1, 2, 3…). La primera vez que se revisa es 1; si regresa con correcciones y se revisa de nuevo, es 2, etc. |
| `fecha` | Instant (Date) | Fecha y hora en que se realizó esta revisión. |
| `revisado_por` | String | Usuario que hizo la revisión (ej. `academico` o id de usuario). |
| `resultado` | String | `"observaciones"` o `"aprobado"`. Indica si se devolvió con observaciones o si se aprobó y se envió al siguiente paso. |
| `observaciones` | String (opcional) | Texto libre con las observaciones cuando `resultado = "observaciones"`. Es el mensaje que ve el egresado para corregir. |
| `detalle_observaciones` | Array (opcional) | Lista de observaciones por sección o documento, si se quiere detallar (ej. “Anexo XXXI: corregir fecha”, “Constancia: revisar nombre”). |
| `fecha_envio_siguiente` | Instant (opcional) | Cuando `resultado = "aprobado"`, fecha en que se envió al siguiente departamento (Registro y liberación). Puede coincidir con `fecha` o guardarse al dar de alta en ese flujo. |

---

## Ejemplo de documentos

**Revisión con observaciones (primera vez):**

```json
{
  "_id": ObjectId("..."),
  "egresado_id": ObjectId("..."),
  "numero_revision": 1,
  "fecha": ISODate("2026-03-05T18:00:00Z"),
  "revisado_por": "academico",
  "resultado": "observaciones",
  "observaciones": "Corregir datos del asesor en la página 3. La constancia debe tener fecha reciente."
}
```

**Segunda revisión, nuevamente con observaciones:**

```json
{
  "egresado_id": ObjectId("..."),
  "numero_revision": 2,
  "fecha": ISODate("2026-03-10T14:30:00Z"),
  "revisado_por": "academico",
  "resultado": "observaciones",
  "observaciones": "Falta firmar el anexo XXXI."
}
```

**Revisión aprobada (envío al siguiente departamento):**

```json
{
  "egresado_id": ObjectId("..."),
  "numero_revision": 3,
  "fecha": ISODate("2026-03-15T10:00:00Z"),
  "revisado_por": "academico",
  "resultado": "aprobado",
  "fecha_envio_siguiente": ISODate("2026-03-15T10:00:00Z")
}
```

---

## Uso en la aplicación

- **Pestaña “En corrección”**: egresados cuya **última revisión** tiene `resultado = "observaciones"`.
- **Pestaña “Pendientes”**: enviados al departamento académico que aún **no tienen ninguna revisión** (o se puede definir otra regla de negocio).
- **Pestaña “Aprobados”**: egresados con al menos una revisión con `resultado = "aprobado"` (y típicamente con `fecha_recibido_registro_liberacion` en el egresado cuando el siguiente departamento los recibe).
- En la vista de detalle de un egresado en departamento académico se puede listar el historial de `revisiones` por `egresado_id` ordenado por `numero_revision` o `fecha`.
- El egresado en su vista de seguimiento puede ver solo las observaciones de la **última revisión** con `resultado = "observaciones"`.

Si más adelante quieres añadir campos (por ejemplo, adjuntos de la revisión o estados intermedios), se pueden extender los documentos sin romper lo que ya tengas guardado.
