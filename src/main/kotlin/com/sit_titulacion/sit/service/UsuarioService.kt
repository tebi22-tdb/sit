package com.sit_titulacion.sit.service

import com.sit_titulacion.sit.domain.Usuario
import com.sit_titulacion.sit.repository.UsuarioRepository
import org.bson.types.ObjectId
import org.slf4j.LoggerFactory
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import java.security.SecureRandom

@Service
class UsuarioService(
    private val usuarioRepository: UsuarioRepository,
    private val passwordEncoder: PasswordEncoder,
) {
    private val log = LoggerFactory.getLogger(UsuarioService::class.java)

    private val random = SecureRandom()

    /** Genera una contraseña aleatoria de 6 dígitos. */
    fun generarPasswordSegura(): String {
        return (1..6).map { random.nextInt(10) }.joinToString("")
    }

    /**
     * Crea un usuario egresado: genera contraseña, la hashea, guarda en usuarios.
     * @return Pair(username, passwordPlana) para enviar por correo
     */
    fun crearUsuarioEgresado(numeroControl: String, egresadoId: ObjectId): Pair<String, String> {
        if (usuarioRepository.existsByUsername(numeroControl)) {
            throw IllegalArgumentException("Ya existe un usuario con número de control: $numeroControl")
        }
        val passwordPlana = generarPasswordSegura()
        val passwordHash = passwordEncoder.encode(passwordPlana) ?: ""
        val usuario = Usuario(
            username = numeroControl,
            passwordHash = passwordHash,
            rol = "egresado",
            egresadoId = egresadoId,
            activo = true,
        )
        usuarioRepository.save(usuario)
        log.info("Usuario creado para egresado: username={}, egresadoId={}", numeroControl, egresadoId)
        return Pair(numeroControl, passwordPlana)
    }

    /**
     * Crea el usuario egresado o actualiza el existente con egresadoId (para que el seguimiento cargue).
     * Si el usuario ya existía, solo se vincula al egresado y no se cambia la contraseña (segundo elemento "").
     * @return Pair(username, passwordPlana) — passwordPlana vacío si el usuario ya existía (no reenviar correo)
     */
    fun crearOVincularUsuarioEgresado(numeroControl: String, egresadoId: ObjectId): Pair<String, String> {
        val trimmed = numeroControl.trim()
        val existente = usuarioRepository.findByUsername(trimmed)
        return if (existente != null) {
            val actualizado = existente.copy(egresadoId = egresadoId, fechaActualizacion = java.time.Instant.now())
            usuarioRepository.save(actualizado)
            log.info("Usuario egresado actualizado con egresadoId: username={}", trimmed)
            Pair(trimmed, "") // No enviar correo; ya tenía contraseña
        } else {
            crearUsuarioEgresado(trimmed, egresadoId)
        }
    }

    /**
     * Crea un usuario de personal (coordinador, académico, servicios escolares).
     * usernameLogin se usa para iniciar sesión (ej. el correo); se guarda y se envía por correo la contraseña.
     */
    fun crearUsuarioStaff(
        nombre: String,
        usernameLogin: String,
        rol: String,
        correoElectronico: String,
        curp: String,
    ): Pair<String, String> {
        val userTrim = usernameLogin.trim()
        val correoTrim = correoElectronico.trim()
        if (userTrim.isBlank()) throw IllegalArgumentException("El usuario (para iniciar sesión) es obligatorio.")
        if (correoTrim.isBlank()) throw IllegalArgumentException("El correo electrónico es obligatorio.")
        if (usuarioRepository.existsByUsername(userTrim)) {
            throw IllegalArgumentException("Ya existe un usuario con ese correo/usuario: $userTrim")
        }
        val passwordPlana = generarPasswordSegura()
        val passwordHash = passwordEncoder.encode(passwordPlana) ?: ""
        val usuario = Usuario(
            username = userTrim,
            passwordHash = passwordHash,
            rol = rol,
            egresadoId = null,
            nombre = nombre.trim().takeIf { it.isNotBlank() },
            curp = curp.trim().takeIf { it.isNotBlank() },
            correoElectronico = correoTrim,
            activo = true,
        )
        usuarioRepository.save(usuario)
        log.info("Usuario staff creado: username={}, rol={}", userTrim, rol)
        return Pair(userTrim, passwordPlana)
    }

    fun listarUsuariosStaff(): List<Usuario> =
        usuarioRepository.findAll()
            .filter { !it.rol.trim().equals("egresado", ignoreCase = true) }
            .sortedByDescending { it.fechaCreacion }
}
