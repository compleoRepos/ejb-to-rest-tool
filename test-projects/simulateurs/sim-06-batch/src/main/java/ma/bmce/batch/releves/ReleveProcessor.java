package ma.bmce.batch.releves;

import javax.batch.api.chunk.ItemProcessor;
import javax.ejb.EJB;

public class ReleveProcessor implements ItemProcessor {

    // JNDI vers service document
    @EJB(lookup = "java:global/bmce-document-ejb/GenererDocumentUC")
    private Object documentService;

    @Override
    public Object processItem(Object item) throws Exception {
        // Génération PDF du relevé
        return item;
    }
}
