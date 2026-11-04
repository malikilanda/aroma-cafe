package com.aromacafe.commande.table;

import org.springframework.data.jpa.repository.JpaRepository;

/** findById(5), save(), findAll() : tout ce qu'il faut pour les états des tables. */
public interface TableStateRepository extends JpaRepository<TableState, Integer> {
}