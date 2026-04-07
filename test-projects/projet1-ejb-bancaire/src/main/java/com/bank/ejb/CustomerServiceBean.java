package com.bank.ejb;

import javax.ejb.Stateless;
import javax.ejb.EJB;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import javax.persistence.TypedQuery;
import java.util.Date;
import java.util.List;
import java.util.logging.Logger;

import com.bank.entity.Customer;
import com.bank.dto.CustomerDTO;

/**
 * Service EJB de gestion des clients.
 * @author Hamza NORDINE
 */
@Stateless
public class CustomerServiceBean {

    private static final Logger LOGGER = Logger.getLogger(CustomerServiceBean.class.getName());

    @PersistenceContext(unitName = "bankPU")
    private EntityManager entityManager;

    @EJB
    private AuditServiceBean auditService;

    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public Customer createCustomer(CustomerDTO dto) {
        Customer customer = new Customer();
        customer.setFirstName(dto.getFirstName());
        customer.setLastName(dto.getLastName());
        customer.setEmail(dto.getEmail());
        customer.setPhone(dto.getPhone());
        customer.setAddress(dto.getAddress());
        customer.setDateOfBirth(dto.getDateOfBirth());
        customer.setNationalId(dto.getNationalId());
        customer.setStatus("ACTIVE");
        customer.setCreatedDate(new Date());
        customer.setKycStatus("PENDING");

        entityManager.persist(customer);
        auditService.logAction("CUSTOMER_CREATED", "Client créé: " + customer.getLastName());
        return customer;
    }

    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public boolean customerExists(String customerId) {
        Customer customer = entityManager.find(Customer.class, Long.parseLong(customerId));
        return customer != null && "ACTIVE".equals(customer.getStatus());
    }

    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public Customer getCustomerById(String customerId) {
        return entityManager.find(Customer.class, Long.parseLong(customerId));
    }

    @TransactionAttribute(TransactionAttributeType.SUPPORTS)
    public List<Customer> searchCustomers(String keyword) {
        TypedQuery<Customer> query = entityManager.createQuery(
            "SELECT c FROM Customer c WHERE c.lastName LIKE :kw OR c.firstName LIKE :kw OR c.email LIKE :kw",
            Customer.class
        );
        query.setParameter("kw", "%" + keyword + "%");
        return query.getResultList();
    }

    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void updateKycStatus(String customerId, String kycStatus) {
        Customer customer = getCustomerById(customerId);
        if (customer != null) {
            customer.setKycStatus(kycStatus);
            customer.setLastModifiedDate(new Date());
            entityManager.merge(customer);
            auditService.logAction("KYC_UPDATED", "KYC mis à jour pour " + customerId + ": " + kycStatus);
        }
    }
}
