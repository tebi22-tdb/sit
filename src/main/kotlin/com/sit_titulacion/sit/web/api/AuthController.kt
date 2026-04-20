package com.sit_titulacion.sit.web.api

import com.sit_titulacion.sit.config.UsuarioPrincipal
import com.sit_titulacion.sit.security.JwtService
import org.springframework.context.annotation.Profile
import org.springframework.http.ResponseEntity
import org.springframework.security.authentication.AuthenticationManager
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class UsuarioActualDto(
    val username: String,
    val rol: String,
    val nombre: String? = null,
    val segmento_academico: String? = null,
    val carreras_asignadas: List<String> = emptyList(),
)
data class HashRequest(val password: String? = null)
data class HashResponse(val hash: String)
data class LoginRequest(val username: String = "", val password: String = "")

@RestController
@RequestMapping("/api/auth")
class AuthController(
    private val passwordEncoder: PasswordEncoder,
    private val authenticationManager: AuthenticationManager,
    private val jwtService: JwtService,
) {

    /**
     * Login JSON: devuelve JWT para sessionStorage (cada pestaña tiene su propio token).
     */
    @PostMapping("/login")
    fun login(@RequestBody body: LoginRequest): ResponseEntity<Any> {
        val u = body.username.trim()
        if (u.isBlank() || body.password.isEmpty()) {
            return ResponseEntity.badRequest().body(mapOf("error" to "Usuario y contraseña son obligatorios"))
        }
        return try {
            val auth = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken(u, body.password),
            )
            val principal = auth.principal as UsuarioPrincipal
            val token = jwtService.generateToken(principal)
            ResponseEntity.ok(
                mapOf(
                    "username" to principal.username,
                    "rol" to principal.getRol(),
                    "nombre" to principal.getNombre(),
                    "segmento_academico" to principal.getSegmentoAcademico(),
                    "carreras_asignadas" to principal.getCarrerasAsignadas(),
                    "access_token" to token,
                ),
            )
        } catch (_: BadCredentialsException) {
            ResponseEntity.status(401).body(mapOf("error" to "Credenciales inválidas"))
        } catch (_: Exception) {
            ResponseEntity.status(401).body(mapOf("error" to "Credenciales inválidas"))
        }
    }

    /** Solo perfil dev: hash BCrypt para crear usuario coordinador en MongoDB. */
    @Profile("dev")
    @PostMapping("/hash")
    fun hash(@RequestBody body: HashRequest): ResponseEntity<HashResponse> {
        body.password
            ?.takeIf { it.isNotBlank() }
            ?.let { pwd ->
                @Suppress("USELESS_CAST")
                val hash = passwordEncoder.encode(pwd) as String
                return ResponseEntity.ok(HashResponse(hash))
            }
        return ResponseEntity.badRequest().build()
    }

    @GetMapping("/me")
    fun me(@AuthenticationPrincipal principal: UsuarioPrincipal?): ResponseEntity<UsuarioActualDto> {
        val auth = principal ?: (SecurityContextHolder.getContext().authentication?.principal as? UsuarioPrincipal)
        if (auth == null) {
            return ResponseEntity.status(401).build()
        }
        return ResponseEntity.ok(UsuarioActualDto(
            username = auth.username,
            rol = auth.getRol(),
            nombre = auth.getNombre(),
            segmento_academico = auth.getSegmentoAcademico(),
            carreras_asignadas = auth.getCarrerasAsignadas(),
        ))
    }
}
