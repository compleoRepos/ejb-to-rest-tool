package ma.bmce.batch.virements;

import javax.batch.api.chunk.ItemProcessor;
import javax.ejb.EJB;

public class VirementProcessor implements ItemProcessor {

    // JNDI vers sim-02-virement
    @EJB(lookup = "java:global/bmce-virement-swift-ejb/ValiderVirementUC")
    private Object virementService;

    @Override
    public Object processItem(Object item) throws Exception {
        // Appel JNDI pour exécuter le virement
        return item;
    }
}
