package com.sit_titulacion.sit.web.api

import com.sit_titulacion.sit.config.UsuarioPrincipal
import com.sit_titulacion.sit.service.EmailService
import com.sit_titulacion.sit.service.UsuarioService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class CrearUsuarioRequest(
    val nombre: String = "",
    val rol: String = "",
    val correo_electronico: String = "",
    val curp: String = "",
)

data class UsuarioStaffItemDto(
    val id: String,
    val nombre: String,
    val username: String,
    val rol: String,
    val curp: String?,
    val correo_electronico: String?,
    val activo: Boolean,
)

@RestController
@RequestMapping("/api/usuarios")
class UsuarioController(
    private val usuarioService: UsuarioService,
    private val emailService: EmailService,
) {
    @GetMapping
    fun listar(@AuthenticationPrincipal principal: UsuarioPrincipal?): ResponseEntity<Any> {
        if (principal == null || principal.getRol() != "coordinador") {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(mapOf("error" to "Solo el coordinador puede ver usuarios."))
        }
        val lista = usuarioService.listarUsuariosStaff().map {
            UsuarioStaffItemDto(
                id = it.id?.toHexString() ?: "",
                nombre = it.nombre ?: it.username,
                username = it.username,
                rol = it.rol,
                curp = it.curp,
                correo_electronico = it.correoElectronico,
                activo = it.activo,
            )
        }
        return ResponseEntity.ok(lista)
    }

    /**
     * Crea un usuario de personal (solo coordinador).
     * Genera contraseña, guarda el usuario y envía credenciales al correo.
     */
    @PostMapping
    fun crear(
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
        @RequestBody body: CrearUsuarioRequest,
    ): ResponseEntity<Any> {
        if (principal == null || principal.getRol() != "coordinador") {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(mapOf("error" to "Solo el coordinador puede agregar usuarios."))
        }
        val nombre = body.nombre.trim()
        val rol = body.rol.trim().ifBlank { "coordinador" }
        val correo = body.correo_electronico.trim()
        val curp = body.curp.trim()
        if (correo.isBlank()) {
            return ResponseEntity.badRequest().body(mapOf("error" to "El correo electrónico es obligatorio."))
        }
        return try {
            val (user, password) = usuarioService.crearUsuarioStaff(nombre, correo, rol, correo, curp)
            emailService.enviarCredenciales(correo, user, password)
            ResponseEntity.ok(mapOf(
                "ok" to true,
                "message" to "Usuario creado. Se han enviado las credenciales al correo.",
            ))
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().body(mapOf("error" to (e.message ?: "Datos inválidos.")))
        }
    }
}
