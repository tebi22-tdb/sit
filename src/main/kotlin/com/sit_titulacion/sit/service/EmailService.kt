package com.sit_titulacion.sit.service

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.stereotype.Service

@Service
class EmailService(
    @Autowired(required = false) private val mailSender: JavaMailSender?,
    @Value("\${spring.mail.username:}") private val fromEmail: String,
) {
    private val log = LoggerFactory.getLogger(EmailService::class.java)

    /**
     * Envía las credenciales al correo del egresado.
     * Si spring.mail no está configurado, solo registra en log.
     */
    fun enviarCredenciales(
        correoDestino: String,
        usuario: String,
        password: String,
    ) {
        if (correoDestino.isBlank()) {
            log.warn("No se puede enviar correo: correo destino vacío")
            return
        }
        if (mailSender == null || fromEmail.isBlank()) {
            log.warn("Spring Mail no configurado. Credenciales generadas (usuario={}): envío omitido.", usuario)
            return
        }
        try {
            val mensaje = SimpleMailMessage().apply {
                setFrom(fromEmail)
                setTo(correoDestino.trim())
                subject = "SIT - Tus credenciales de acceso"
                text = """
                    Hola,

                    Se ha creado tu cuenta en el Sistema Integral de Titulación (SIT).

                    Usuario: $usuario
                    Contraseña: $password

                    Guarda estas credenciales para iniciar sesión.

                    Saludos.
                """.trimIndent()
            }
            mailSender!!.send(mensaje)
            log.info("Correo enviado a {} con credenciales para usuario {}", correoDestino, usuario)
        } catch (e: Exception) {
            log.error("Error al enviar correo a {}: {}", correoDestino, e.message)
            throw e
        }
    }
}
