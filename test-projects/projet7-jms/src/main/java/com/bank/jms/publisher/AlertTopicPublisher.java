package com.bank.jms.publisher;

import com.bank.jms.model.FraudAlert;
import com.bank.jms.model.TransactionMessage;
import com.bank.jms.util.JmsHelper;

import javax.jms.ConnectionFactory;
import javax.jms.JMSContext;
import javax.jms.Topic;
import javax.naming.Context;
import javax.naming.NamingException;
import java.util.Date;
import java.util.UUID;

/**
 * Publie des alertes de fraude sur un sujet JMS.
 * @author Hamza NORDINE
 */
public class AlertTopicPublisher {

    private static final String TOPIC_NAME = "jms/topic/alertTopic";

    /**
     * Publie une alerte de fraude.
     *
     * @param suspiciousTransaction La transaction suspecte.
     */
    public void publishAlert(TransactionMessage suspiciousTransaction) {
        Context context = null;
        JMSContext jmsContext = null;
        try {
            context = JmsHelper.getInitialContext();
            ConnectionFactory cf = JmsHelper.lookupConnectionFactory(context);
            Topic topic = JmsHelper.lookupTopic(context, TOPIC_NAME);

            FraudAlert alert = new FraudAlert(
                    UUID.randomUUID().toString(),
                    suspiciousTransaction.getTransactionId(),
                    suspiciousTransaction.getAccountNumber(),
                    new Date(),
                    "High transaction amount",
                    0.9
            );

            jmsContext = cf.createContext();
            jmsContext.createProducer().send(topic, alert);

            System.out.println("Fraud alert published for transaction: " + suspiciousTransaction.getTransactionId());

        } catch (NamingException e) {
            e.printStackTrace();
        } finally {
            JmsHelper.close(jmsContext);
            if (context != null) {
                try {
                    context.close();
                } catch (NamingException e) {
                    e.printStackTrace();
                }
            }
        }
    }
}
