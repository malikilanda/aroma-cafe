package com.aromacafe.commande.order;

import com.aromacafe.commande.menu.MenuCatalog;
import com.aromacafe.commande.order.OrderDtos.*;
import com.aromacafe.commande.table.TableState;
import com.aromacafe.commande.table.TableStateRepository;
import com.aromacafe.commande.table.TableTokens;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Consumer;

/**
 * Toutes les règles des commandes d'Aroma Café.
 * Les contrôleurs (API) ne font qu'appeler ces méthodes.
 */
@Service
public class OrderService {

    /** Heure du Sénégal : le numéro de commande repart à 1 à minuit, heure de Dakar. */
    static final ZoneId DAKAR = ZoneId.of("Africa/Dakar");

    private static final EnumSet<OrderStatus> UNPAID = EnumSet.of(OrderStatus.NOUVELLE, OrderStatus.EN_CUISINE, OrderStatus.SERVIE);
    private static final EnumSet<OrderStatus> ACTIVE = EnumSet.of(OrderStatus.NOUVELLE, OrderStatus.EN_CUISINE);
    private static final String TOPIC = "/topic/caisse";

    private final OrderRepository orders;
    private final TableStateRepository tables;
    private final MenuCatalog catalog;
    private final TableTokens tokens;
    private final SimpMessagingTemplate ws;
    private final TransactionTemplate tx;
    private final Clock clock = Clock.system(DAKAR);

    /** Une seule création de commande à la fois : deux tables qui commandent à la même seconde
     *  ne peuvent pas recevoir le même numéro. */
    private final ReentrantLock createLock = new ReentrantLock();

    public OrderService(OrderRepository orders, TableStateRepository tables, MenuCatalog catalog,
                        TableTokens tokens, SimpMessagingTemplate ws, TransactionTemplate tx) {
        this.orders = orders;
        this.tables = tables;
        this.catalog = catalog;
        this.tokens = tokens;
        this.ws = ws;
        this.tx = tx;
    }

    // =====================================================================================
    //  CÔTÉ CLIENT (téléphone)
    // =====================================================================================

    /** Le QR code scanné est-il authentique ? */
    public void checkTable(int table, String token) {
        if (!tokens.isValid(table, token)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "QR code de table invalide. Scannez à nouveau le QR code de votre table.");
        }
    }

    /** Reçoit une commande : vérifie, recalcule les prix, numérote, enregistre, prévient la caisse. */
    public ClientOrderView create(CreateOrderRequest req) {
        checkTable(req.table(), req.token());

        // Les prix sont recalculés ici, à partir de la carte : le téléphone n'en envoie aucun
        List<OrderLine> lines = req.lines().stream().map(this::price).toList();

        CustomerOrder saved;
        boolean isNew;
        createLock.lock();
        try {
            Optional<CustomerOrder> existing = orders.findByClientRef(req.clientRef());
            if (existing.isPresent()) {
                // Double envoi (réseau lent, double appui) : on renvoie la commande déjà créée
                saved = existing.get();
                isNew = false;
            } else {
                saved = tx.execute(s -> {
                    int number = orders.maxNumberSince(startOfDay()) + 1;
                    return orders.saveAndFlush(new CustomerOrder(UUID.randomUUID().toString(),
                            req.clientRef(), number, req.table(), lines, clock.instant()));
                });
                isNew = true;
            }
        } finally {
            createLock.unlock();
        }

        if (isNew) push("ORDER_CREATED", saved);
        return ClientOrderView.of(saved);
    }

    /** Recalcule le prix d'une ligne et vérifie les options choisies. */
    private OrderLine price(LineRequest line) {
        MenuCatalog.Product product = catalog.find(line.itemId())
                .orElseThrow(() -> bad("Un produit de votre panier n'est plus à la carte. Retirez-le puis renvoyez la commande."));

        Map<String, List<String>> picked = line.options() == null ? Map.of() : line.options();

        // Aucun groupe d'options inventé
        for (String groupId : picked.keySet()) {
            if (product.group(groupId).isEmpty()) {
                throw bad("Option inconnue pour « " + product.name() + " ».");
            }
        }

        int unitPrice = product.price();
        List<String> labels = new ArrayList<>();

        for (MenuCatalog.OptionGroup group : product.options()) {
            List<String> choiceIds = picked.getOrDefault(group.id(), List.of()).stream().distinct().toList();

            if (group.required() && choiceIds.isEmpty()) {
                throw bad("Choisissez : " + group.label().toLowerCase() + " pour « " + product.name() + " ».");
            }
            if (!group.multi() && choiceIds.size() > 1) {
                throw bad("Un seul choix possible : " + group.label().toLowerCase() + ".");
            }

            for (String choiceId : choiceIds) {
                MenuCatalog.Choice choice = group.choice(choiceId)
                        .orElseThrow(() -> bad("Option inconnue pour « " + product.name() + " »."));
                unitPrice += choice.price();
                // Libellé imprimé sur les tickets
                if (choice.price() > 0) labels.add(choice.label() + " (+" + choice.price() + " F)");
                else if (group.required()) labels.add(choice.label());
                else labels.add(group.label() + " : " + choice.label());
            }
        }

        String note = line.note() == null ? null : line.note().strip();
        if (note != null && note.isEmpty()) note = null;

        return new OrderLine(product.id(), product.name(), product.categoryTitle(),
                line.quantity(), unitPrice, labels, note);
    }

    /** Suivi d'une commande par le téléphone du client. */
    public ClientOrderView track(String publicId) {
        return orders.findByPublicId(publicId)
                .map(ClientOrderView::of)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Commande introuvable."));
    }

    /** Le client appuie sur « Demander l'addition ». */
    public void requestBill(int table, String token) {
        checkTable(table, token);
        tx.executeWithoutResult(s -> {
            TableState state = tables.findById(table).orElseGet(() -> new TableState(table));
            state.requestBill(clock.instant());
            tables.save(state);
        });
        ws.convertAndSend(TOPIC, new CaisseEvent("BILL_REQUESTED", null, table));
    }

    // =====================================================================================
    //  CÔTÉ CAISSE (tablette)
    // =====================================================================================

    /** Commandes à traiter et en cuisine, les plus anciennes d'abord. */
    public List<OrderView> active() {
        return orders.findByStatusInOrderByCreatedAtAsc(ACTIVE).stream().map(OrderView::of).toList();
    }

    /** Toutes les commandes du jour, les plus récentes d'abord. */
    public List<OrderView> today() {
        return orders.findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(startOfDay())
                .stream().map(OrderView::of).toList();
    }

    /** « Envoyer en cuisine » : le ticket cuisine vient d'être imprimé. */
    public OrderView transmit(long id) {
        return change(id, order -> {
            if (!ACTIVE.contains(order.getStatus())) {
                throw conflict("Cette commande ne peut plus être envoyée en cuisine.");
            }
            order.transmit(clock.instant());
        });
    }

    /** « Marquer servie » : la serveuse a apporté la commande. */
    public OrderView serve(long id) {
        return change(id, order -> {
            if (!ACTIVE.contains(order.getStatus())) {
                throw conflict("Cette commande est déjà servie ou clôturée.");
            }
            order.serve(clock.instant());
        });
    }

    /** « Annuler » : seulement tant qu'elle n'est ni servie ni payée. */
    public OrderView cancel(long id) {
        return change(id, order -> {
            if (!ACTIVE.contains(order.getStatus())) {
                throw conflict("Une commande servie ou payée ne peut plus être annulée.");
            }
            order.cancel(clock.instant());
        });
    }

    /** Applique un changement à une commande, l'enregistre et prévient la caisse. */
    private OrderView change(long id, Consumer<CustomerOrder> action) {
        CustomerOrder order = tx.execute(s -> {
            CustomerOrder found = orders.findById(id)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Commande introuvable."));
            action.accept(found);
            return orders.save(found);
        });
        push("ORDER_UPDATED", order);
        return OrderView.of(order);
    }

    /** État des 10 tables : libre, occupée (combien, quel total), addition demandée. */
    public List<TableView> tables() {
        Map<Integer, List<CustomerOrder>> byTable = new HashMap<>();
        for (CustomerOrder o : orders.findByStatusInOrderByCreatedAtAsc(UNPAID)) {
            byTable.computeIfAbsent(o.getTableNumber(), k -> new ArrayList<>()).add(o);
        }
        Map<Integer, Instant> bills = new HashMap<>();
        for (TableState t : tables.findAll()) {
            if (t.getBillRequestedAt() != null) bills.put(t.getNumber(), t.getBillRequestedAt());
        }

        List<TableView> result = new ArrayList<>();
        for (int n = 1; n <= tokens.tableCount(); n++) {
            List<CustomerOrder> list = byTable.getOrDefault(n, List.of());
            result.add(new TableView(
                    n,
                    list.size(),
                    (int) list.stream().filter(o -> ACTIVE.contains(o.getStatus())).count(),
                    list.stream().mapToInt(CustomerOrder::getTotal).sum(),
                    list.isEmpty() ? null : list.get(0).getCreatedAt(),
                    bills.get(n)));
        }
        return result;
    }

    /** Addition d'une table : toutes ses commandes non payées, produits identiques regroupés. */
    public BillView bill(int table) {
        List<CustomerOrder> list = orders.findByTableNumberAndStatusInOrderByCreatedAtAsc(table, UNPAID);

        Map<String, BillLine> grouped = new LinkedHashMap<>();
        for (CustomerOrder o : list) {
            for (OrderLine l : o.getLines()) {
                String key = l.getName() + "|" + String.join("|", l.getOptions()) + "|" + l.getUnitPrice();
                grouped.merge(key,
                        new BillLine(l.getName(), l.getOptions(), l.getQuantity(), l.getUnitPrice(), l.getLineTotal()),
                        (a, b) -> new BillLine(a.name(), a.options(), a.quantity() + b.quantity(),
                                a.unitPrice(), a.lineTotal() + b.lineTotal()));
            }
        }

        return new BillView(table,
                list.stream().map(CustomerOrder::getNumber).toList(),
                List.copyOf(grouped.values()),
                list.stream().mapToInt(CustomerOrder::getTotal).sum(),
                clock.instant());
    }

    /** « Encaisser » : toutes les commandes non payées de la table passent en PAYEE, la table est libérée. */
    public void close(int table) {
        tx.executeWithoutResult(s -> {
            Instant now = clock.instant();
            for (CustomerOrder o : orders.findByTableNumberAndStatusInOrderByCreatedAtAsc(table, UNPAID)) {
                o.pay(now);
                orders.save(o);
            }
            tables.findById(table).ifPresent(t -> {
                t.clearBill();
                tables.save(t);
            });
        });
        ws.convertAndSend(TOPIC, new CaisseEvent("TABLE_CLOSED", null, table));
    }

    /** Liens des QR codes des tables (à compléter avec l'adresse du serveur). */
    public List<Map<String, Object>> qrLinks() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (int n = 1; n <= tokens.tableCount(); n++) {
            list.add(Map.of("table", n, "path", "/?t=" + n + "&k=" + tokens.tokenFor(n)));
        }
        return list;
    }

    // =====================================================================================
    //  Outils
    // =====================================================================================

    private Instant startOfDay() {
        return LocalDate.now(clock).atStartOfDay(DAKAR).toInstant();
    }

    /** Publie un événement sur /topic/caisse : la tablette le reçoit instantanément. */
    private void push(String type, CustomerOrder order) {
        ws.convertAndSend(TOPIC, new CaisseEvent(type, OrderView.of(order), order.getTableNumber()));
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}