package com.aromacafe.commande.order;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * Accès aux commandes en base de données.
 *
 * JpaRepository fournit déjà save(), findById(), findAll(), delete()…
 * Pour le reste, Spring Data lit le NOM de la méthode et génère la requête SQL tout seul :
 *   findByPublicId          -> ... WHERE public_id = ?
 *   findByStatusIn...       -> ... WHERE status IN (...) ORDER BY created_at ASC
 */
public interface OrderRepository extends JpaRepository<CustomerOrder, Long> {

    /** Suivi d'une commande par le téléphone du client. */
    Optional<CustomerOrder> findByPublicId(String publicId);

    /** Anti double envoi : cette commande a-t-elle déjà été reçue ? */
    Optional<CustomerOrder> findByClientRef(String clientRef);

    /** Caisse : les commandes à traiter ou en cuisine, les plus anciennes d'abord. */
    List<CustomerOrder> findByStatusInOrderByCreatedAtAsc(Collection<OrderStatus> statuses);

    /** Caisse : l'historique du jour, les plus récentes d'abord. */
    List<CustomerOrder> findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(Instant since);

    /** Addition : les commandes non payées d'une table. */
    List<CustomerOrder> findByTableNumberAndStatusInOrderByCreatedAtAsc(int tableNumber, Collection<OrderStatus> statuses);

    /** Plus grand numéro de commande depuis ce matin (le suivant sera +1). */
    @Query("select coalesce(max(o.number), 0) from CustomerOrder o where o.createdAt >= :since")
    int maxNumberSince(@Param("since") Instant since);
}