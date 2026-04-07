package com.bank.jms.producer;

import com.bank.jms.model.TransactionMessage;
import com.bank.jms.util.JmsHelper;

import javax.jms.ConnectionFactory;
import javax.jms.JMSContext;
import javax.jms.Queue;
import javax.naming.Context;
import javax.naming.NamingException;

/**
 * Produit et envoie des messages de transaction à une file d'attente JMS.
 * @author Hamza NORDINE
 */
public class TransactionMessageProducer {

    private static final String QUEUE_NAME = "jms/queue/transactionQueue";

    /**
     * Envoie un message de transaction.
     *
     * @param transactionMessage Le message de transaction à envoyer.
     */
    public void sendMessage(TransactionMessage transactionMessage) {
        Context context = null;
        JMSContext jmsContext = null;
        try {
            context = JmsHelper.getInitialContext();
            ConnectionFactory cf = JmsHelper.lookupConnectionFactory(context);
            Queue queue = JmsHelper.lookupQueue(context, QUEUE_NAME);

            jmsContext = cf.createContext();
            jmsContext.createProducer().send(queue, transactionMessage);

            System.out.println("Transaction message sent: " + transactionMessage.getTransactionId());

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
