package com.aromacafe.commande.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * Transforme toutes les erreurs de l'API en une réponse simple : {"message": "..."}.
 * Le menu et la caisse affichent directement ce message à l'écran.
 */
@RestControllerAdvice
public class ApiErrors {

    /** Nos propres erreurs (OrderService) : on garde leur code (400, 403, 404, 409) et leur message. */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> businessError(ResponseStatusException e) {
        String message = e.getReason() != null ? e.getReason() : "Action impossible.";
        return ResponseEntity.status(e.getStatusCode()).body(Map.of("message", message));
    }

    /** Commande refusée par la validation (@Valid) : quantité, nombre de lignes, note trop longue… */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> invalidOrder(MethodArgumentNotValidException e) {
        return ResponseEntity.badRequest().body(Map.of("message",
                "Commande incomplète ou trop grande : 20 articles au maximum par produit, 40 lignes au maximum."));
    }

    /** Corps de requête illisible (JSON mal formé). */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> unreadable(HttpMessageNotReadableException e) {
        return ResponseEntity.badRequest().body(Map.of("message", "Requête illisible. Rechargez la page et réessayez."));
    }

    /** Paramètre manquant dans l'adresse (ex. le jeton « k » du QR code). */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, String>> missingParameter(MissingServletRequestParameterException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message",
                "Lien incomplet. Scannez à nouveau le QR code de votre table."));
    }
}