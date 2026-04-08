package ma.bmce.batch.jms;

import javax.ejb.MessageDriven;
import javax.ejb.ActivationConfigProperty;
import javax.jms.Message;
import javax.jms.MessageListener;
import javax.jms.TextMessage;
import java.util.logging.Logger;

// Pattern D: JMS sans DLQ — RES-008
@MessageDriven(
    mappedName = "jms/BatchResultQueue",
    activationConfig = {
        @ActivationConfigProperty(propertyName = "destinationType", propertyValue = "javax.jms.Queue"),
        @ActivationConfigProperty(propertyName = "destination", propertyValue = "jms/BatchResultQueue")
    }
)
public class BatchResultListener implements MessageListener {

    private static final Logger log = Logger.getLogger(BatchResultListener.class.getName());

    @Override
    public void onMessage(Message message) {
        try {
            TextMessage tm = (TextMessage) message;
            log.info("Batch terminé: " + tm.getText());
        } catch (Exception e) {
            log.severe("Erreur traitement message batch: " + e.getMessage());
        }
    }
}
