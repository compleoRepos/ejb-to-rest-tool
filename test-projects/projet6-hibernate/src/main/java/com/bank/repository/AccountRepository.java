package com.bank.repository;

import com.bank.exception.RepositoryException;
import com.bank.model.Account;
import com.bank.util.HibernateUtil;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.hibernate.query.Query;

import java.util.List;

/**
 * Repository pour la gestion des comptes bancaires.
 * Auteur: Hamza NORDINE
 */
public class AccountRepository {

    private SessionFactory sessionFactory;

    public AccountRepository() {
        this.sessionFactory = HibernateUtil.getSessionFactory();
    }

    public Account findById(Long id) throws RepositoryException {
        try (Session session = sessionFactory.openSession()) {
            return session.get(Account.class, id);
        }
    }

    public List<Account> findAll() throws RepositoryException {
        try (Session session = sessionFactory.openSession()) {
            Query<Account> query = session.createQuery("from Account", Account.class);
            return query.list();
        }
    }

    public List<Account> findByOwnerName(String ownerName) throws RepositoryException {
        try (Session session = sessionFactory.openSession()) {
            Query<Account> query = session.createQuery("from Account where owner.firstName = :ownerName or owner.lastName = :ownerName", Account.class);
            query.setParameter("ownerName", ownerName);
            return query.list();
        }
    }
}
