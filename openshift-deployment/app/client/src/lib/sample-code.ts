/**
 * Exemples de code Java legacy pour démonstration.
 * Couvre : EJB, JNDI, JMS, Servlets, SOAP, JDBC, Struts, Hibernate.
 * @author Compleo
 */

export const SAMPLE_EJB_INJECTION = `package com.bank.legacy.client;

import javax.ejb.EJB;
import javax.ejb.Stateless;

/**
 * Service client legacy utilisant des injections EJB.
 */
@Stateless
public class PaymentProcessor {

    @EJB
    TransferService transferService;

    @EJB
    AccountService accountService;

    @EJB
    AuditService auditService;

    public void processPayment(String fromAccount, String toAccount, double amount) {
        // Vérification du solde
        Account account = accountService.getAccount(fromAccount);

        // Exécution du virement
        TransferResult result = transferService.transferMoney(fromAccount, toAccount, amount);

        // Audit
        auditService.logAction("PAYMENT", result.getId());
    }

    public Account getAccountDetails(String accountId) {
        return accountService.getAccount(accountId);
    }

    public List<Transfer> getTransferHistory(String accountId) {
        return transferService.findTransfersByAccount(accountId);
    }
}`;

export const SAMPLE_JNDI_LOOKUP = `package com.bank.legacy.client;

import javax.naming.Context;
import javax.naming.InitialContext;
import javax.naming.NamingException;

/**
 * Service client legacy utilisant des lookups JNDI.
 */
public class LegacyPaymentClient {

    public TransferResult executeTransfer(String from, String to, double amount) {
        try {
            Context ctx = new InitialContext();

            TransferService service =
                (TransferService) ctx.lookup("java:global/bank/TransferService");

            TransferResult result = service.transferMoney(from, to, amount);

            AccountService accountService =
                (AccountService) ctx.lookup("java:global/bank/AccountService");

            Account fromAccount = accountService.getAccount(from);

            return result;
        } catch (NamingException e) {
            throw new RuntimeException("Erreur JNDI", e);
        }
    }
}`;

export const SAMPLE_COMPLEX = `package com.bank.legacy.batch;

import javax.ejb.EJB;
import javax.ejb.Stateless;
import javax.ejb.TransactionAttribute;
import javax.ejb.TransactionAttributeType;
import javax.jms.JMSContext;
import javax.jms.Queue;
import javax.annotation.Resource;

/**
 * Service complexe avec transactions, JMS et dépendances multiples.
 */
@Stateless
public class BatchPaymentProcessor {

    @EJB
    TransferService transferService;

    @EJB
    AccountService accountService;

    @EJB
    NotificationService notificationService;

    @Resource(mappedName = "jms/PaymentQueue")
    private Queue paymentQueue;

    @Resource
    private JMSContext jmsContext;

    @TransactionAttribute(TransactionAttributeType.REQUIRED)
    public void processBatchPayments(List<PaymentRequest> payments) {
        for (PaymentRequest payment : payments) {
            TransferResult result = transferService.transferMoney(
                payment.getFrom(), payment.getTo(), payment.getAmount()
            );

            notificationService.sendNotification(payment.getFrom(), "Virement effectué");

            // Envoi JMS pour traitement asynchrone
            jmsContext.createProducer().send(paymentQueue, result.getId());
        }
    }

    @TransactionAttribute(TransactionAttributeType.REQUIRES_NEW)
    public Account validateAccount(String accountId) {
        return accountService.getAccount(accountId);
    }

    public List<Transfer> getRecentTransfers(String accountId) {
        return transferService.findTransfersByAccount(accountId);
    }
}`;

export const SAMPLE_SERVLET = `package com.bank.legacy.web;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import java.io.IOException;
import java.io.PrintWriter;

/**
 * Servlet legacy pour la gestion des comptes bancaires.
 */
@WebServlet(urlPatterns = {"/accounts", "/accounts/*"})
public class AccountServlet extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        HttpSession session = request.getSession();
        String accountId = request.getParameter("id");

        response.setContentType("text/html");
        PrintWriter out = response.getWriter();

        if (accountId != null) {
            // Affichage d'un compte spécifique
            out.println("<html><body>");
            out.println("<h1>Détails du compte " + accountId + "</h1>");
            out.println("</body></html>");
        } else {
            // Liste des comptes
            out.println("<html><body>");
            out.println("<h1>Liste des comptes</h1>");
            out.println("</body></html>");
        }
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        String owner = request.getParameter("owner");
        String type = request.getParameter("type");
        double initialBalance = Double.parseDouble(request.getParameter("balance"));

        // Création du compte
        response.sendRedirect("/accounts?created=true");
    }

    @Override
    protected void doDelete(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        String accountId = request.getParameter("id");
        response.setStatus(HttpServletResponse.SC_NO_CONTENT);
    }
}`;

export const SAMPLE_SOAP = `package com.bank.legacy.ws;

import javax.jws.WebService;
import javax.jws.WebMethod;
import javax.jws.WebParam;
import javax.jws.WebResult;
import javax.jws.soap.SOAPBinding;
import javax.xml.ws.WebServiceContext;
import javax.annotation.Resource;

/**
 * Service web SOAP legacy pour les opérations de virement.
 */
@WebService(
    name = "TransferWebService",
    serviceName = "TransferService",
    targetNamespace = "http://bank.com/transfer"
)
@SOAPBinding(style = SOAPBinding.Style.DOCUMENT)
public class TransferWebService {

    @Resource
    private WebServiceContext wsContext;

    @WebMethod(operationName = "executeTransfer")
    @WebResult(name = "transferResult")
    public TransferResult executeTransfer(
            @WebParam(name = "fromAccount") String fromAccount,
            @WebParam(name = "toAccount") String toAccount,
            @WebParam(name = "amount") double amount,
            @WebParam(name = "currency") String currency) {

        // Validation
        if (amount <= 0) {
            throw new RuntimeException("Montant invalide");
        }

        // Exécution du virement
        TransferResult result = new TransferResult();
        result.setTransferId("TRF-" + System.currentTimeMillis());
        result.setStatus("COMPLETED");
        return result;
    }

    @WebMethod(operationName = "getTransferStatus")
    @WebResult(name = "status")
    public String getTransferStatus(
            @WebParam(name = "transferId") String transferId) {
        return "COMPLETED";
    }

    @WebMethod(operationName = "cancelTransfer")
    @WebResult(name = "cancelled")
    public boolean cancelTransfer(
            @WebParam(name = "transferId") String transferId,
            @WebParam(name = "reason") String reason) {
        return true;
    }
}`;

export const SAMPLE_JDBC = `package com.bank.legacy.dao;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * DAO legacy utilisant JDBC direct pour l'accès aux données.
 */
public class AccountDAO {

    private static final String DB_URL = "jdbc:oracle:thin:@localhost:1521:bankdb";
    private static final String DB_USER = "bank_user";
    private static final String DB_PASS = "bank_pass";

    public Account findById(String accountId) throws SQLException {
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;

        try {
            conn = DriverManager.getConnection(DB_URL, DB_USER, DB_PASS);
            stmt = conn.prepareStatement(
                "SELECT id, owner, balance, type, status FROM accounts WHERE id = ?");
            stmt.setString(1, accountId);
            rs = stmt.executeQuery();

            if (rs.next()) {
                Account account = new Account();
                account.setId(rs.getString("id"));
                account.setOwner(rs.getString("owner"));
                account.setBalance(rs.getDouble("balance"));
                account.setType(rs.getString("type"));
                account.setStatus(rs.getString("status"));
                return account;
            }
            return null;
        } finally {
            if (rs != null) rs.close();
            if (stmt != null) stmt.close();
            if (conn != null) conn.close();
        }
    }

    public List<Account> findAll() throws SQLException {
        List<Account> accounts = new ArrayList<>();
        Connection conn = DriverManager.getConnection(DB_URL, DB_USER, DB_PASS);
        Statement stmt = conn.createStatement();
        ResultSet rs = stmt.executeQuery("SELECT * FROM accounts");

        while (rs.next()) {
            Account account = new Account();
            account.setId(rs.getString("id"));
            account.setOwner(rs.getString("owner"));
            account.setBalance(rs.getDouble("balance"));
            accounts.add(account);
        }

        rs.close();
        stmt.close();
        conn.close();
        return accounts;
    }

    public void save(Account account) throws SQLException {
        Connection conn = DriverManager.getConnection(DB_URL, DB_USER, DB_PASS);
        PreparedStatement stmt = conn.prepareStatement(
            "INSERT INTO accounts (id, owner, balance, type, status) VALUES (?, ?, ?, ?, ?)");
        stmt.setString(1, account.getId());
        stmt.setString(2, account.getOwner());
        stmt.setDouble(3, account.getBalance());
        stmt.setString(4, account.getType());
        stmt.setString(5, account.getStatus());
        stmt.executeUpdate();
        stmt.close();
        conn.close();
    }

    public void updateBalance(String accountId, double newBalance) throws SQLException {
        Connection conn = DriverManager.getConnection(DB_URL, DB_USER, DB_PASS);
        PreparedStatement stmt = conn.prepareStatement(
            "UPDATE accounts SET balance = ? WHERE id = ?");
        stmt.setDouble(1, newBalance);
        stmt.setString(2, accountId);
        stmt.executeUpdate();
        stmt.close();
        conn.close();
    }
}`;

export const SAMPLE_STRUTS = `package com.bank.legacy.action;

import org.apache.struts.action.Action;
import org.apache.struts.action.ActionForm;
import org.apache.struts.action.ActionForward;
import org.apache.struts.action.ActionMapping;
import org.apache.struts.action.ActionMessage;
import org.apache.struts.action.ActionMessages;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * Action Struts legacy pour la gestion des virements.
 */
public class TransferAction extends Action {

    @Override
    public ActionForward execute(
            ActionMapping mapping,
            ActionForm form,
            HttpServletRequest request,
            HttpServletResponse response) throws Exception {

        TransferForm transferForm = (TransferForm) form;
        String fromAccount = transferForm.getFromAccount();
        String toAccount = transferForm.getToAccount();
        double amount = transferForm.getAmount();

        ActionMessages messages = new ActionMessages();

        if (amount <= 0) {
            messages.add("amount", new ActionMessage("error.amount.invalid"));
            saveMessages(request, messages);
            return mapping.findForward("input");
        }

        try {
            // Exécution du virement
            boolean success = executeTransfer(fromAccount, toAccount, amount);

            if (success) {
                messages.add("success", new ActionMessage("transfer.success"));
                saveMessages(request, messages);
                return mapping.findForward("success");
            } else {
                messages.add("error", new ActionMessage("transfer.failed"));
                saveMessages(request, messages);
                return mapping.findForward("failure");
            }
        } catch (Exception e) {
            messages.add("error", new ActionMessage("error.system"));
            saveMessages(request, messages);
            return mapping.findForward("error");
        }
    }

    private boolean executeTransfer(String from, String to, double amount) {
        // Logique métier legacy
        return true;
    }
}`;

export const SAMPLE_HIBERNATE = `package com.bank.legacy.dao;

import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.hibernate.Transaction;
import org.hibernate.Query;
import org.hibernate.Criteria;
import org.hibernate.criterion.Restrictions;
import org.hibernate.cfg.Configuration;
import java.util.List;

/**
 * DAO legacy utilisant Hibernate avec Session directe.
 */
public class CustomerHibernateDAO {

    private SessionFactory sessionFactory;

    public CustomerHibernateDAO() {
        this.sessionFactory = new Configuration()
            .configure("hibernate.cfg.xml")
            .buildSessionFactory();
    }

    public Customer findById(Long customerId) {
        Session session = sessionFactory.openSession();
        try {
            return (Customer) session.get(Customer.class, customerId);
        } finally {
            session.close();
        }
    }

    @SuppressWarnings("deprecation")
    public List<Customer> findByName(String name) {
        Session session = sessionFactory.openSession();
        try {
            Criteria criteria = session.createCriteria(Customer.class);
            criteria.add(Restrictions.like("name", "%" + name + "%"));
            return criteria.list();
        } finally {
            session.close();
        }
    }

    public List<Customer> findActiveCustomers() {
        Session session = sessionFactory.openSession();
        try {
            Query query = session.createQuery(
                "FROM Customer c WHERE c.status = :status ORDER BY c.name");
            query.setParameter("status", "ACTIVE");
            return query.list();
        } finally {
            session.close();
        }
    }

    public void save(Customer customer) {
        Session session = sessionFactory.openSession();
        Transaction tx = null;
        try {
            tx = session.beginTransaction();
            session.saveOrUpdate(customer);
            tx.commit();
        } catch (Exception e) {
            if (tx != null) tx.rollback();
            throw e;
        } finally {
            session.close();
        }
    }

    public void delete(Long customerId) {
        Session session = sessionFactory.openSession();
        Transaction tx = null;
        try {
            tx = session.beginTransaction();
            Customer customer = (Customer) session.get(Customer.class, customerId);
            if (customer != null) {
                session.delete(customer);
            }
            tx.commit();
        } catch (Exception e) {
            if (tx != null) tx.rollback();
            throw e;
        } finally {
            session.close();
        }
    }
}`;

export const SAMPLE_CODES = [
  { name: "Injection @EJB", code: SAMPLE_EJB_INJECTION },
  { name: "Lookup JNDI", code: SAMPLE_JNDI_LOOKUP },
  { name: "Complexe (JMS + Transactions)", code: SAMPLE_COMPLEX },
  { name: "Servlet HTTP", code: SAMPLE_SERVLET },
  { name: "Service SOAP/WSDL", code: SAMPLE_SOAP },
  { name: "JDBC Direct (DAO)", code: SAMPLE_JDBC },
  { name: "Struts Action", code: SAMPLE_STRUTS },
  { name: "Hibernate Session", code: SAMPLE_HIBERNATE },
];
