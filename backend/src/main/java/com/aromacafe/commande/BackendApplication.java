package com.aromacafe.commande;

import com.aromacafe.commande.config.AromaProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
@ConfigurationPropertiesScan   // active les classes @ConfigurationProperties (AromaProperties)
public class BackendApplication {

    private static final Logger log = LoggerFactory.getLogger(BackendApplication.class);

    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }

    /** Au démarrage, affiche un résumé de la configuration dans le terminal. */
    @Bean
    CommandLineRunner resumeConfiguration(AromaProperties props) {
        return args -> log.info("Aroma Café prêt : {} tables, caisse « {} »",
                props.tables(), props.caisse().username());
    }
}