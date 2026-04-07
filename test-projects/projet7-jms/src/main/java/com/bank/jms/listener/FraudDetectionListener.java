package com.bank.jms.listener;

import com.bank.jms.model.TransactionMessage;
import com.bank.jms.publisher.AlertTopicPublisher;

import javax.jms.JMSException;
import javax.jms.Message;
import javax.jms.MessageListener;
import javax.jms.ObjectMessage;

/**
 * Écoute les messages de transaction pour la détection de fraude.
 * @author Hamza NORDINE
 */
public class FraudDetectionListener implements MessageListener {

    private final AlertTopicPublisher alertPublisher = new AlertTopicPublisher();

    /**
     * Traite la réception d'un message de transaction.
     *
     * @param message Le message reçu.
     */
    @Override
    public void onMessage(Message message) {
        try {
            if (message instanceof ObjectMessage) {
                ObjectMessage objectMessage = (ObjectMessage) message;
                Object object = objectMessage.getObject();

                if (object instanceof TransactionMessage) {
                    TransactionMessage transaction = (TransactionMessage) object;
                    System.out.println("Analyzing transaction for fraud: " + transaction.getTransactionId());
                    // Logique de détection de fraude
                    if (isSuspicious(transaction)) {
                        // En cas de suspicion, publie une alerte
                        alertPublisher.publishAlert(transaction);
                    }
                } else {
                    System.err.println("Unknown message type for fraud detection.");
                }
            } else {
                System.err.println("Message is not an ObjectMessage for fraud detection.");
            }
        } catch (JMSException e) {
            e.printStackTrace();
        }
    }

    private boolean isSuspicious(TransactionMessage transaction) {
        // Simulation d'une logique de détection de fraude simple
        return transaction.getAmount().doubleValue() > 10000;
    }
}
