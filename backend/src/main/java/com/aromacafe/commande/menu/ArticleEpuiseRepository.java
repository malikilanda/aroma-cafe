package com.aromacafe.commande.menu;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface ArticleEpuiseRepository extends JpaRepository<ArticleEpuise, String> {
    /** les articles épuisés pour ce jour-là */
    List<ArticleEpuise> findByJour(LocalDate jour);
}
