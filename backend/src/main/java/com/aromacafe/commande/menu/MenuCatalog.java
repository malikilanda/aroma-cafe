package com.aromacafe.commande.menu;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * La carte d'Aroma Café, chargée une seule fois au démarrage depuis src/main/resources/menu.json.
 *
 * - raw()      : le fichier tel quel, envoyé au menu client (/api/menu)
 * - find(id)   : un produit avec ses options, pour recalculer le prix d'une commande
 *
 * Le prix envoyé par un téléphone n'est jamais utilisé : c'est toujours cette carte qui fait foi.
 */
@Component
public class MenuCatalog {

    private static final Logger log = LoggerFactory.getLogger(MenuCatalog.class);

    // ---------- Structure du fichier menu.json (lecture seule) ----------

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Choice(String id, String label, int price) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OptionGroup(String id, String label, String type, boolean required, List<Choice> choices) {
        public boolean multi() { return "multi".equals(type); }

        public Optional<Choice> choice(String choiceId) {
            return choices.stream().filter(c -> c.id().equals(choiceId)).findFirst();
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ItemJson(String id, String name, int price, String sub, List<OptionGroup> options) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CategoryJson(String id, String group, String title, List<OptionGroup> options, List<ItemJson> items) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record MenuJson(String currency, List<CategoryJson> categories) {}

    // ---------- Ce que le reste du serveur utilise ----------

    /** Un produit prêt à être commandé : ses options = celles de sa catégorie + les siennes. */
    public record Product(String id, String name, String categoryTitle, int price, List<OptionGroup> options) {
        public Optional<OptionGroup> group(String groupId) {
            return options.stream().filter(g -> g.id().equals(groupId)).findFirst();
        }
    }

    private final byte[] raw;
    private final Map<String, Product> products = new LinkedHashMap<>();

    public MenuCatalog(ObjectMapper mapper) throws IOException {
        try (InputStream in = new ClassPathResource("menu.json").getInputStream()) {
            raw = in.readAllBytes();
        }
        MenuJson menu = mapper.readValue(raw, MenuJson.class);

        for (CategoryJson cat : menu.categories()) {
            for (ItemJson item : cat.items()) {
                List<OptionGroup> options = new ArrayList<>();
                if (cat.options() != null) options.addAll(cat.options());
                if (item.options() != null) options.addAll(item.options());

                if (products.containsKey(item.id())) {
                    throw new IllegalStateException("menu.json : identifiant en double « " + item.id() + " »");
                }
                products.put(item.id(), new Product(item.id(), item.name(), cat.title(), item.price(), List.copyOf(options)));
            }
        }
        log.info("Carte chargée : {} catégories, {} produits", menu.categories().size(), products.size());
    }

    /** Le fichier menu.json brut, pour l'envoyer tel quel au navigateur. */
    public byte[] raw() {
        return raw;
    }

    /** Retrouve un produit par son identifiant (ex. "cafe-chaud--cafe-latte"). */
    public Optional<Product> find(String productId) {
        return Optional.ofNullable(products.get(productId));
    }
}