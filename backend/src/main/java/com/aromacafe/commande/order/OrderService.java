package com.aromacafe.commande.order;

import com.aromacafe.commande.menu.Disponibilites;
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

import java.time.*;
import java.util.*;
import java.util.concurrent.locks.ReentrantLock;

@Service
public class OrderService {
    static final ZoneId DAKAR = ZoneId.of("Africa/Dakar");
    private static final EnumSet<OrderStatus> UNPAID = EnumSet.of(OrderStatus.NOUVELLE, OrderStatus.EN_CUISINE, OrderStatus.SERVIE);
    private static final EnumSet<OrderStatus> ACTIVE = EnumSet.of(OrderStatus.NOUVELLE, OrderStatus.EN_CUISINE);

    private final OrderRepository orders;
    private final TableStateRepository tables;
    private final MenuCatalog catalog;
    private final Disponibilites dispo;
    private final TableTokens tokens;
    private final SimpMessagingTemplate ws;
    private final TransactionTemplate tx;
    private final Clock clock;
    /** une seule création à la fois : garantit des numéros de commande du jour sans doublon */
    private final ReentrantLock createLock = new ReentrantLock();

    public OrderService(OrderRepository orders, TableStateRepository tables, MenuCatalog catalog, Disponibilites dispo,
                        TableTokens tokens, SimpMessagingTemplate ws, TransactionTemplate tx) {
        this.orders = orders;
        this.tables = tables;
        this.catalog = catalog;
        this.dispo = dispo;
        this.tokens = tokens;
        this.ws = ws;
        this.tx = tx;
        this.clock = Clock.system(DAKAR);
    }

    // ------------------------------------------------------------------ côté client

    public ClientOrderView create(CreateOrderRequest req) {
        if (!tokens.isValid(req.table(), req.token())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "QR code de table invalide. Scannez à nouveau le QR code de votre table.");
        }
        // même commande renvoyée (réseau lent, double appui) : on rend celle déjà enregistrée
        Optional<CustomerOrder> already = orders.findByClientRef(req.clientRef());
        if (already.isPresent()) return ClientOrderView.of(already.get());

        // un article épuisé aujourd'hui ne peut pas être commandé
        Set<String> soldOut = dispo.epuisesAujourdhui();
        for (LineRequest l : req.lines()) {
            if (soldOut.contains(l.itemId())) {
                String name = catalog.find(l.itemId()).map(MenuCatalog.Product::name).orElse("Un article");
                throw conflict("« " + name + " » n'est plus disponible aujourd'hui. Retirez-le de votre panier puis renvoyez la commande.");
            }
        }
        List<OrderLine> lines = req.lines().stream().map(this::price).toList();

        CustomerOrder saved;
        createLock.lock();
        try {
            saved = tx.execute(s -> {
                Optional<CustomerOrder> existing = orders.findByClientRef(req.clientRef());
                if (existing.isPresent()) return existing.get();
                int number = orders.maxNumberSince(startOfDay()) + 1;
                return orders.saveAndFlush(new CustomerOrder(UUID.randomUUID().toString(), req.clientRef(), number, req.table(), lines, clock.instant()));
            });
        } finally {
            createLock.unlock();
        }
        if (saved.getCreatedAt() != null && saved.getStatus() == OrderStatus.NOUVELLE) {
            push("ORDER_CREATED", saved);
        }
        return ClientOrderView.of(saved);
    }

    /** Recalcule le prix d'une ligne et vérifie les options choisies. */
    private OrderLine price(LineRequest l) {
        MenuCatalog.Product item = catalog.find(l.itemId())
                .orElseThrow(() -> bad("Un produit de votre panier n'est plus à la carte. Retirez-le puis renvoyez la commande."));
        Map<String, List<String>> picked = l.options() == null ? Map.of() : l.options();
        for (String groupId : picked.keySet()) {
            if (item.group(groupId).isEmpty()) throw bad("Option inconnue pour « " + item.name() + " ».");
        }
        int unit = item.price();
        List<String> labels = new ArrayList<>();
        for (MenuCatalog.OptionGroup g : item.options()) {
            List<String> ids = picked.getOrDefault(g.id(), List.of()).stream().distinct().toList();
            if (g.required() && ids.isEmpty()) throw bad("Choisissez : " + g.label().toLowerCase() + " pour « " + item.name() + " ».");
            if (!g.multi() && ids.size() > 1) throw bad("Un seul choix possible : " + g.label().toLowerCase() + ".");
            for (String id : ids) {
                MenuCatalog.Choice c = g.choice(id).orElseThrow(() -> bad("Option inconnue pour « " + item.name() + " »."));
                unit += c.price();
                labels.add(c.price() > 0 ? c.label() + " (+" + c.price() + " F)" : (g.required() ? c.label() : g.label() + " : " + c.label()));
            }
        }
        String note = l.note() == null ? null : l.note().strip();
        return new OrderLine(item.id(), item.name(), item.categoryTitle(), l.quantity(), unit, labels, note == null || note.isEmpty() ? null : note);
    }

    public ClientOrderView track(String publicId) {
        return orders.findByPublicId(publicId).map(ClientOrderView::of)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Commande introuvable."));
    }

    public void checkTable(int table, String token) {
        if (!tokens.isValid(table, token)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "QR code de table invalide.");
    }

    public void requestBill(int table, String token) {
        checkTable(table, token);
        tx.executeWithoutResult(s -> {
            TableState t = tables.findById(table).orElseGet(() -> new TableState(table));
            t.requestBill(clock.instant());
            tables.save(t);
        });
        ws.convertAndSend("/topic/caisse", new CaisseEvent("BILL_REQUESTED", null, table));
    }

    // ------------------------------------------------------------------ côté caisse

    public List<OrderView> active() {
        return orders.findByStatusInOrderByCreatedAtAsc(ACTIVE).stream().map(OrderView::of).toList();
    }

    public List<OrderView> today() {
        return orders.findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(startOfDay()).stream().map(OrderView::of).toList();
    }

    public OrderView transmit(long id) {
        return change(id, o -> {
            if (o.getStatus() != OrderStatus.NOUVELLE && o.getStatus() != OrderStatus.EN_CUISINE)
                throw conflict("Cette commande ne peut plus être envoyée en cuisine.");
            o.transmit(clock.instant());
        });
    }

    public OrderView serve(long id) {
        return change(id, o -> {
            if (!ACTIVE.contains(o.getStatus())) throw conflict("Cette commande est déjà servie ou clôturée.");
            o.serve(clock.instant());
        });
    }

    public OrderView cancel(long id) {
        return change(id, o -> {
            if (!ACTIVE.contains(o.getStatus())) throw conflict("Une commande servie ou payée ne peut plus être annulée.");
            o.cancel(clock.instant());
        });
    }

    /**
     * Retire un article d'une commande (épuisé, erreur, demande du client).
     * Seulement avant que la commande soit servie. Option : marquer l'article épuisé pour la journée.
     */
    public OrderView removeLine(long id, int index, RemoveLineRequest req) {
        OrderView view = change(id, o -> {
            if (!ACTIVE.contains(o.getStatus())) throw conflict("On ne peut plus retirer d'article : la commande est déjà servie ou clôturée.");
            if (index < 0 || index >= o.getLines().size() || !o.getLines().get(index).getItemId().equals(req.itemId()))
                throw conflict("La commande a changé entre-temps. Rouvrez-la et réessayez.");
            o.removeLine(index, req.reason().name(), clock.instant());
        });
        if (req.markSoldOut()) dispo.marquer(req.itemId(), true);
        return view;
    }

    private OrderView change(long id, java.util.function.Consumer<CustomerOrder> action) {
        CustomerOrder o = tx.execute(s -> {
            CustomerOrder found = orders.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Commande introuvable."));
            action.accept(found);
            return orders.save(found);
        });
        push("ORDER_UPDATED", o);
        return OrderView.of(o);
    }

    public List<TableView> tables() {
        Map<Integer, List<CustomerOrder>> byTable = new HashMap<>();
        for (CustomerOrder o : orders.findByStatusInOrderByCreatedAtAsc(UNPAID)) {
            byTable.computeIfAbsent(o.getTableNumber(), k -> new ArrayList<>()).add(o);
        }
        Map<Integer, Instant> bills = new HashMap<>();
        tables.findAll().forEach(t -> { if (t.getBillRequestedAt() != null) bills.put(t.getNumber(), t.getBillRequestedAt()); });
        List<TableView> out = new ArrayList<>();
        for (int n = 1; n <= tokens.tableCount(); n++) {
            List<CustomerOrder> list = byTable.getOrDefault(n, List.of());
            out.add(new TableView(n, list.size(),
                    (int) list.stream().filter(o -> ACTIVE.contains(o.getStatus())).count(),
                    list.stream().mapToInt(CustomerOrder::getTotal).sum(),
                    list.isEmpty() ? null : list.get(0).getCreatedAt(),
                    bills.get(n)));
        }
        return out;
    }

    /** Addition : toutes les commandes non payées de la table, lignes identiques regroupées. */
    public BillView bill(int table) {
        List<CustomerOrder> list = orders.findByTableNumberAndStatusInOrderByCreatedAtAsc(table, UNPAID);
        Map<String, BillLine> grouped = new LinkedHashMap<>();
        for (CustomerOrder o : list) {
            for (OrderLine l : o.getLines()) {
                String key = l.getName() + "|" + String.join("|", l.getOptions()) + "|" + l.getUnitPrice();
                grouped.merge(key, new BillLine(l.getName(), l.getOptions(), l.getQuantity(), l.getUnitPrice(), l.getLineTotal()),
                        (a, b) -> new BillLine(a.name(), a.options(), a.quantity() + b.quantity(), a.unitPrice(), a.lineTotal() + b.lineTotal()));
            }
        }
        return new BillView(table, list.stream().map(CustomerOrder::getNumber).toList(), List.copyOf(grouped.values()),
                list.stream().mapToInt(CustomerOrder::getTotal).sum(), clock.instant());
    }

    /** Encaissement : clôture toutes les commandes non payées de la table et libère la table. */
    public void close(int table) {
        tx.executeWithoutResult(s -> {
            Instant now = clock.instant();
            for (CustomerOrder o : orders.findByTableNumberAndStatusInOrderByCreatedAtAsc(table, UNPAID)) {
                o.pay(now);
                orders.save(o);
            }
            tables.findById(table).ifPresent(t -> { t.clearBill(); tables.save(t); });
        });
        ws.convertAndSend("/topic/caisse", new CaisseEvent("TABLE_CLOSED", null, table));
    }

    public Map<String, Object> qrLinks() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (int n = 1; n <= tokens.tableCount(); n++) {
            list.add(Map.of("table", n, "path", "/?t=" + n + "&k=" + tokens.tokenFor(n)));
        }
        return Map.of("tables", list);
    }

    // ------------------------------------------------------------------ outils

    private Instant startOfDay() {
        return LocalDate.now(clock).atStartOfDay(DAKAR).toInstant();
    }

    private void push(String type, CustomerOrder o) {
        ws.convertAndSend("/topic/caisse", new CaisseEvent(type, OrderView.of(o), o.getTableNumber()));
    }

    private static ResponseStatusException bad(String msg) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, msg); }
    private static ResponseStatusException conflict(String msg) { return new ResponseStatusException(HttpStatus.CONFLICT, msg); }
}
