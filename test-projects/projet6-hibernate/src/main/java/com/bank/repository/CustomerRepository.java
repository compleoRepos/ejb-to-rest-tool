package com.bank.repository;

import com.bank.exception.RepositoryException;
import com.bank.model.Customer;
import com.bank.util.HibernateUtil;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.hibernate.Transaction;

import java.util.List;

/**
 * Repository pour la gestion des clients.
 * Auteur: Hamza NORDINE
 */
public class CustomerRepository {

    private SessionFactory sessionFactory;

    public CustomerRepository() {
        this.sessionFactory = HibernateUtil.getSessionFactory();
    }

    public void save(Customer customer) throws RepositoryException {
        Transaction transaction = null;
        try (Session session = sessionFactory.openSession()) {
            transaction = session.beginTransaction();
            session.save(customer);
            transaction.commit();
        } catch (Exception e) {
            if (transaction != null) {
                transaction.rollback();
            }
            throw new RepositoryException("Could not save customer", e);
        }
    }

    public void update(Customer customer) throws RepositoryException {
        Transaction transaction = null;
        try (Session session = sessionFactory.openSession()) {
            transaction = session.beginTransaction();
            session.update(customer);
            transaction.commit();
        } catch (Exception e) {
            if (transaction != null) {
                transaction.rollback();
            }
            throw new RepositoryException("Could not update customer", e);
        }
    }

    public void delete(Customer customer) throws RepositoryException {
        Transaction transaction = null;
        try (Session session = sessionFactory.openSession()) {
            transaction = session.beginTransaction();
            session.delete(customer);
            transaction.commit();
        } catch (Exception e) {
            if (transaction != null) {
                transaction.rollback();
            }
            throw new RepositoryException("Could not delete customer", e);
        }
    }

    @SuppressWarnings("unchecked")
    public List<Customer> findAllWithNativeSQL() throws RepositoryException {
        try (Session session = sessionFactory.openSession()) {
            return session.createNativeQuery("SELECT * FROM Customer").addEntity(Customer.class).list();
        }
    }
}
