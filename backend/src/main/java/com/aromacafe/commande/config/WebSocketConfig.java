package com.aromacafe.commande.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * Canal temps réel entre le serveur et la tablette caisse.
 *
 *   tablette  ──connexion──►  /ws
 *   tablette  ◄──abonnement──  /topic/caisse   (nouvelles commandes, demandes d'addition…)
 *
 * Protocole STOMP par-dessus WebSocket : la caisse « s'abonne » à un sujet,
 * et le serveur y publie un message à chaque événement.
 * L'accès à /ws est réservé à la caisse connectée (voir SecurityConfig).
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Petit « facteur » intégré au serveur : il distribue les messages publiés sur /topic/…
        registry.enableSimpleBroker("/topic");
        // Préfixe des messages envoyés PAR les navigateurs (on n'en a pas besoin, mais c'est la convention)
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Adresse de connexion : ws://<serveur>:8080/ws
        registry.addEndpoint("/ws");
    }
}