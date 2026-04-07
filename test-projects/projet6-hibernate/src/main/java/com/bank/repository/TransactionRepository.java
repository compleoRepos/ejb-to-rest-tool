package com.bank.repository;

import com.bank.exception.RepositoryException;
import com.bank.model.Transaction;
import com.bank.util.HibernateUtil;
import org.hibernate.Criteria;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.hibernate.criterion.Restrictions;

import java.util.Date;
import java.util.List;

/**
 * Repository pour la gestion des transactions bancaires.
 * Auteur: Hamza NORDINE
 */
public class TransactionRepository {

    private SessionFactory sessionFactory;

    public TransactionRepository() {
        this.sessionFactory = HibernateUtil.getSessionFactory();
    }

    public List<Transaction> findByAccountId(Long accountId) throws RepositoryException {
        try (Session session = sessionFactory.openSession()) {
            Criteria criteria = session.createCriteria(Transaction.class);
            criteria.add(Restrictions.eq("account.id", accountId));
            return criteria.list();
        }
    }

    public List<Transaction> findByDateRange(Date startDate, Date endDate) throws RepositoryException {
        try (Session session = sessionFactory.openSession()) {
            Criteria criteria = session.createCriteria(Transaction.class);
            criteria.add(Restrictions.between("date", startDate, endDate));
            return criteria.list();
        }
    }
}
