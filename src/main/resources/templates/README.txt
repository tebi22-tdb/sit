Plantillas Word (ITVO) — Anexos 9.1, 9.2 y 9.3
==============================================

Anexo 9.1 — ITVO-AC-PR-05-02
  Archivo: ITVO-AC-PR-05-02-Solicitud-del-Acto-de-Recepcion-Profesional.docx
  Propiedad opcional: sit.anexo91.plantilla-docx

Anexo 9.2 — ITVO-AC-PR-05-03 (constancia de no inconveniencia)
  Archivo en classpath: templates/anexo-9-2.docx
  Propiedad opcional: sit.anexo92.plantilla-docx (si está vacía, se usa el archivo anterior)

Anexo 9.3 — ITVO-AC-PR-05-04 (aviso de realización del acto)
  Archivo en classpath: templates/anexo-9-3.docx
  Propiedad opcional: sit.anexo93.plantilla-docx
  Requiere sinodales asignados en BD y fecha del acto agendada; rellena jurado, egresado, carrera, fecha/hora del acto y nombre del proyecto.

Si entregan una versión nueva de algún formato, sustituye el .docx correspondiente aquí
(mismo nombre de archivo en templates/) o configura la ruta absoluta en application.properties.

Requisito en el servidor: LibreOffice (programa soffice) para convertir DOCX → PDF.
Sin LibreOffice el SIT genera un PDF de respaldo muy simple (sin membrete ITVO).
