package com.bank.jms.consumer;

import com.bank.jms.model.NotificationMessage;

import javax.ejb.ActivationConfigProperty;
import javax.ejb.MessageDriven;
import javax.jms.JMSException;
import javax.jms.Message;
import javax.jms.MessageListener;
import javax.jms.ObjectMessage;

/**
 * Consommateur de messages de notification via un Message-Driven Bean.
 * @author Hamza NORDINE
 */
@MessageDriven(name = "NotificationMessageConsumer", activationConfig = {
        @ActivationConfigProperty(propertyName = "destinationLookup", propertyValue = "jms/queue/notificationQueue"),
        @ActivationConfigProperty(propertyName = "destinationType", propertyValue = "javax.jms.Queue")
})
public class NotificationMessageConsumer implements MessageListener {

    /**
     * Traite la réception d'un message de notification.
     *
     * @param message Le message reçu.
     */
    @Override
    public void onMessage(Message message) {
        try {
            if (message instanceof ObjectMessage) {
                ObjectMessage objectMessage = (ObjectMessage) message;
                Object object = objectMessage.getObject();

                if (object instanceof NotificationMessage) {
                    NotificationMessage notification = (NotificationMessage) object;
                    System.out.println("Received notification: " + notification.getMessage());
                    // Logique de traitement de la notification (ex: envoi d'un email)
                } else {
                    System.err.println("Unknown message type received.");
                }
            } else {
                System.err.println("Message is not an ObjectMessage.");
            }
        } catch (JMSException e) {
            e.printStackTrace();
        }
    }
}
